import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { updateVehicleState } from "@/lib/dynamo/cc-vehicles";
import { putPoints } from "@/lib/dynamo/cc-vehicle-telemetry";
import { listPendingByVehicle, markSent } from "@/lib/dynamo/cc-vehicle-commands";
import { telemetryPostSchema } from "@/lib/control-center/vehicles/schemas";
import { resolveTimeouts, toCommandMsg } from "@/lib/control-center/vehicles/commandState";

/**
 * The companion's 1 Hz heartbeat. Updates the live state, appends any
 * downsampled history it batched, and — crucially — returns this vehicle's
 * still-pending commands (marking them sent). That response is the command
 * delivery channel in local mode and the fallback in prod.
 */
export async function POST(req: Request) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = telemetryPostSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const now = Date.now();
  const { state, history } = body.data;
  await updateVehicleState(auth.vehicleId, state, state.t, now);
  if (history && history.length > 0) await putPoints(auth.vehicleId, history);

  // Hand back commands the companion hasn't run yet. resolveTimeouts filters out
  // ones already past deadline so we don't dispatch stale work.
  const pending = await listPendingByVehicle(auth.vehicleId);
  const { commands, timedOutIds } = resolveTimeouts(pending, now);
  const deliverable = commands.filter((c) => c.status === "pending" || c.status === "sent");
  const sentIds = deliverable.filter((c) => c.status === "pending").map((c) => c.id);
  if (sentIds.length > 0) await markSent(sentIds, now);

  return NextResponse.json({ ok: true, commands: deliverable.map(toCommandMsg), timedOut: timedOutIds.length });
}
