import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getVehicle, markOperatorSeen } from "@/lib/dynamo/cc-vehicles";
import { listEvents } from "@/lib/dynamo/cc-vehicle-events";
import { listCommandsByVehicle, markTimedOut } from "@/lib/dynamo/cc-vehicle-commands";
import { resolveTimeouts } from "@/lib/control-center/vehicles/commandState";
import { toVehicleView } from "@/lib/control-center/vehicles/view";

/**
 * What the ground station polls over the cloud link, once a second: the live
 * state, STATUSTEXT messages newer than the `after` cursor, and the recent
 * command log. `op=1` means the caller holds control; it stamps
 * operatorSeenAt, which the companion's "operator" heartbeat policy follows.
 * `now` lets the browser judge freshness on the server's clock.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const operator = searchParams.get("op") === "1";
  const actor = await requireVehicleAccess(operator ? "command" : "view");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = Date.now();
  const after = searchParams.get("after") || undefined;
  const [vehicle, events, stored] = await Promise.all([
    getVehicle(params.id),
    listEvents(params.id, { after, limit: after ? 100 : 50 }),
    listCommandsByVehicle(params.id, 30),
  ]);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { commands, timedOutIds } = resolveTimeouts(stored, now);
  await Promise.all([
    timedOutIds.length > 0 ? markTimedOut(timedOutIds) : Promise.resolve(),
    operator ? markOperatorSeen(params.id, now) : Promise.resolve(),
  ]);

  return NextResponse.json({ vehicle: toVehicleView(vehicle, now), events, commands, now: Date.now() });
}
