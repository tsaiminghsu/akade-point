import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";
import { getCommand } from "@/lib/dynamo/cc-vehicle-commands";
import { createMission } from "@/lib/dynamo/cc-vehicle-missions";
import { missionDownloadSchema } from "@/lib/control-center/vehicles/schemas";

/** Companion posts the mission it read off the flight controller in response to
 *  a mission_download command. Stored as a new mission (source: download). */
export async function POST(req: Request) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = missionDownloadSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const command = await getCommand(body.data.commandId);
  if (!command || command.vehicleId !== auth.vehicleId || command.type !== "mission_download") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const vehicle = await getVehicle(auth.vehicleId);
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const mission = await createMission({
    vehicleId: auth.vehicleId,
    name: `Downloaded ${vehicle?.name ?? "vehicle"} ${stamp}`,
    items: body.data.items,
    source: "download",
  });
  return NextResponse.json({ missionId: mission.id });
}
