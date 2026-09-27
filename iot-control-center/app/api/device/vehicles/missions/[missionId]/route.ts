import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { getMission } from "@/lib/dynamo/cc-vehicle-missions";

/** Companion fetches the items for a mission_upload command over HTTPS (the
 *  MQTT command carried only the id, count and checksum). */
export async function GET(req: Request, { params }: { params: { missionId: string } }) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mission = await getMission(params.missionId);
  if (!mission || mission.vehicleId !== auth.vehicleId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ mission: { id: mission.id, name: mission.name, items: mission.items } });
}
