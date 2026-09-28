import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";
import { createCommand, listCommandsByVehicle, markSent, markTimedOut } from "@/lib/dynamo/cc-vehicle-commands";
import { getMission, missionChecksum } from "@/lib/dynamo/cc-vehicle-missions";
import { commandRequestSchema } from "@/lib/control-center/vehicles/schemas";
import { resolveTimeouts, toCommandMsg } from "@/lib/control-center/vehicles/commandState";
import { COMMANDS_BY_TYPE, COMMAND_TIMEOUT_MS, MODES_BY_TYPE, PX4_MODES } from "@/lib/control-center/vehicles/constants";
import { publishVehicleCommand } from "@/lib/iot/publish";
import { blockingLease, CLIENT_HEADER } from "@/lib/control-center/vehicles/lease";
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

  // Another operator holds control: only they may command until it lapses.
  const block = blockingLease(vehicle.controlLease, req.headers.get(CLIENT_HEADER), Date.now());
  if (block) {
    return NextResponse.json({ error: "Another operator has control", code: "LEASE_HELD", lease: { name: block.name, until: block.until } }, { status: 409 });
  }

  const parsed = commandRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const request = parsed.data;

  // The command must be valid for this vehicle type (e.g. takeoff is copter-only).
  if (!COMMANDS_BY_TYPE[vehicle.type].includes(request.type)) {
    return NextResponse.json({ error: `Command "${request.type}" is not available for a ${vehicle.type}` }, { status: 400 });
  }
  if (request.type === "set_mode") {
    const summary = vehicle.state as { v?: number; veh?: { ap?: string } } | null;
    const modes = summary?.v === 2 && summary.veh?.ap === "px4" ? PX4_MODES : MODES_BY_TYPE[vehicle.type];
    if (!modes.includes(request.mode)) {
      return NextResponse.json({ error: `Mode "${request.mode}" is not valid for this vehicle` }, { status: 400 });
    }
  }

  // Build args + resolve the mission for mission_upload (companion fetches items
  // over HTTPS; the command only carries a count and checksum).
  let args: Record<string, unknown> = {};
  switch (request.type) {
    case "disarm":
      args = request.force ? { force: true } : {};
      break;
    case "set_mode":
      args = { mode: request.mode };
      break;
    case "takeoff":
      args = { alt: request.alt };
      break;
    case "goto":
      args = { lat: request.lat, lon: request.lon, alt: request.alt };
      break;
    case "change_alt":
      args = { alt: request.alt };
      break;
    case "change_speed":
      args = { speed: request.speed };
      break;
    case "mission_set_current":
      args = { seq: request.seq };
      break;
    case "mission_download":
    case "mission_clear":
      args = { mtype: request.mtype ?? 0 };
      break;
    case "set_home":
      args = request.current ? { current: true } : { lat: request.lat, lon: request.lon, alt: request.alt };
      break;
    case "param_get":
      args = { names: request.names };
      break;
    case "param_set":
      args = { params: request.params };
      break;
    case "video_record":
      args = { on: request.on };
      break;
    case "gimbal_pitchyaw":
      args = { pitch: request.pitch, yaw: request.yaw, lock: request.lock ?? false };
      break;
    case "gimbal_mode":
      args = { mode: request.mode };
      break;
    case "roi_location":
      args = { lat: request.lat, lon: request.lon, alt: request.alt };
      break;
    case "payload_relay":
      args = { index: request.index, on: request.on, ...(request.comp ? { comp: request.comp } : {}) };
      break;
    case "payload_pulse":
      args = { index: request.index, ms: request.ms, ...(request.comp ? { comp: request.comp } : {}) };
      break;
    case "log_download":
      args = { id: request.id, size: request.size, utc: request.utc ?? 0 };
      break;
    case "payload_servo":
      args = { index: request.index, pwm: request.pwm, ...(request.comp ? { comp: request.comp } : {}) };
      break;
    case "mission_upload": {
      const mission = await getMission(request.missionId);
      if (!mission || mission.vehicleId !== params.id) {
        return NextResponse.json({ error: "Mission not found for this vehicle" }, { status: 404 });
      }
      const mtype = { mission: 0, fence: 1, rally: 2 }[mission.kind ?? "mission"];
      args = { missionId: mission.id, n: mission.items.length, sha: missionChecksum(mission.items), mtype };
      break;
    }
    default:
      args = {};
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
  const pub = await publishVehicleCommand(vehicle.companionId, toCommandMsg(command, Date.now()));
  if (pub.published) {
    await markSent([command.id]);
    command.status = "sent";
    command.sentAt = Date.now();
  }

  return NextResponse.json({ command });
}
