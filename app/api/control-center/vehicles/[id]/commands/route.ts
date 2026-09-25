import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";
import { createCommand, listCommandsByVehicle, markSent, markTimedOut } from "@/lib/dynamo/cc-vehicle-commands";
import { getMission, missionChecksum } from "@/lib/dynamo/cc-vehicle-missions";
import { commandRequestSchema } from "@/lib/control-center/vehicles/schemas";
import { resolveTimeouts, toCommandMsg } from "@/lib/control-center/vehicles/commandState";
import { COMMANDS_BY_TYPE, COMMAND_TIMEOUT_MS, MODES_BY_TYPE } from "@/lib/control-center/vehicles/constants";
import { publishVehicleCommand } from "@/lib/iot/publish";
import type { VehicleCommandType } from "@/lib/control-center/vehicles/types";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);

  const stored = await listCommandsByVehicle(params.id, limit);
  const { commands, timedOutIds } = resolveTimeouts(stored);
  // Persist the timeouts we just derived so later reads and acks agree.
  if (timedOutIds.length > 0) void markTimedOut(timedOutIds);
  return NextResponse.json({ commands });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const actor = await requireVehicleAccess("command");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const vehicle = await getVehicle(params.id);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = commandRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const request = parsed.data;

  // The command must be valid for this vehicle type (e.g. takeoff is copter-only).
  if (!COMMANDS_BY_TYPE[vehicle.type].includes(request.type)) {
    return NextResponse.json({ error: `Command "${request.type}" is not available for a ${vehicle.type}` }, { status: 400 });
  }
  if (request.type === "set_mode" && !MODES_BY_TYPE[vehicle.type].includes(request.mode)) {
    return NextResponse.json({ error: `Mode "${request.mode}" is not valid for a ${vehicle.type}` }, { status: 400 });
  }

  // Build args + resolve the mission for mission_upload (companion fetches items
  // over HTTPS; the command only carries a count and checksum).
  let args: Record<string, unknown> = {};
  const { type } = request;
  if (type === "disarm") args = request.force ? { force: true } : {};
  else if (type === "set_mode") args = { mode: request.mode };
  else if (type === "takeoff") args = { alt: request.alt };
  else if (type === "goto") args = { lat: request.lat, lon: request.lon, alt: request.alt };
  else if (type === "mission_upload") {
    const mission = await getMission(request.missionId);
    if (!mission || mission.vehicleId !== params.id) {
      return NextResponse.json({ error: "Mission not found for this vehicle" }, { status: 404 });
    }
    args = { missionId: mission.id, n: mission.items.length, sha: missionChecksum(mission.items) };
  }

  const command = await createCommand({
    vehicleId: params.id,
    type: request.type as VehicleCommandType,
    args,
    timeoutMs: COMMAND_TIMEOUT_MS[request.type as VehicleCommandType],
    issuedBy: actor.id ?? "admin",
  });

  // Best-effort push. On success the row advances to `sent`; otherwise it stays
  // `pending` and the companion collects it from its next telemetry response.
  const pub = await publishVehicleCommand(vehicle.companionId, toCommandMsg(command));
  if (pub.published) {
    await markSent([command.id]);
    command.status = "sent";
    command.sentAt = Date.now();
  }

  return NextResponse.json({ command });
}
