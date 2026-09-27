import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { updateVehicleState } from "@/lib/dynamo/cc-vehicles";
import { putPoints } from "@/lib/dynamo/cc-vehicle-telemetry";
import { putEvents } from "@/lib/dynamo/cc-vehicle-events";
import { listPendingByVehicle, markSent, markTimedOut, recordDirectCommand } from "@/lib/dynamo/cc-vehicle-commands";
import { telemetryPostSchema } from "@/lib/control-center/vehicles/schemas";
import { resolveTimeouts, toCommandMsg } from "@/lib/control-center/vehicles/commandState";
import { OPERATOR_PRESENT_MS } from "@/lib/control-center/vehicles/constants";
import type { VehicleCommandType, VehicleState } from "@/lib/control-center/vehicles/types";

/**
 * The companion's 1 Hz heartbeat. Updates the live state, appends any
 * downsampled history and STATUSTEXT messages it sent, and — crucially —
 * returns this vehicle's still-pending commands (marking them sent). That
 * response is the command delivery channel in local mode and the fallback in
 * prod.
 *
 * The response also carries `now` (the companion has no RTC and aligns its
 * clock to ours) and `op` (a ground-station page is watching, which drives the
 * companion's "operator" GCS-heartbeat policy).
 */
export async function POST(req: Request) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = telemetryPostSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const now = Date.now();
  const { state, history, msgs, audit } = body.data;
  const [{ operatorSeenAt }] = await Promise.all([
    updateVehicleState(auth.vehicleId, state as Record<string, unknown>, state.t, now),
    // The v2 schema is loose (typed where the server reads it), hence the cast.
    history && history.length > 0 ? putPoints(auth.vehicleId, history as VehicleState[]) : Promise.resolve(),
    msgs && msgs.length > 0 ? putEvents(auth.vehicleId, msgs) : Promise.resolve(),
    ...(audit ?? []).map((a) =>
      recordDirectCommand({
        id: a.id,
        vehicleId: auth.vehicleId,
        type: a.type as VehicleCommandType,
        args: a.args,
        status: a.st,
        timeoutMs: 0,
        issuedBy: a.sub,
        createdAt: a.createdAt,
        ackedAt: a.ackedAt,
        code: a.code,
        msg: a.msg,
        result: a.res,
      })
    ),
  ]);

  // Hand back commands the companion hasn't run yet. resolveTimeouts filters out
  // ones already past deadline so we don't dispatch stale work, and the
  // timeouts it finds are persisted so the command log agrees.
  const pending = await listPendingByVehicle(auth.vehicleId);
  const { commands, timedOutIds } = resolveTimeouts(pending, now);
  const deliverable = commands.filter((c) => c.status === "pending" || c.status === "sent");
  const sentIds = deliverable.filter((c) => c.status === "pending").map((c) => c.id);
  await Promise.all([
    sentIds.length > 0 ? markSent(sentIds, now) : Promise.resolve(),
    timedOutIds.length > 0 ? markTimedOut(timedOutIds) : Promise.resolve(),
  ]);

  return NextResponse.json({
    ok: true,
    commands: deliverable.map((c) => toCommandMsg(c, now)),
    timedOut: timedOutIds.length,
    now: Date.now(),
    op: operatorSeenAt !== null && now - operatorSeenAt < OPERATOR_PRESENT_MS,
  });
}
