import { QueryCommand } from "@aws-sdk/lib-dynamodb";

import type { TelemetryPoint, VehicleState } from "@/lib/control-center/vehicles/types";
import { summarize } from "@/lib/control-center/vehicles/summary";
import { batchPutAll } from "./batch";
import { ddb, TABLES } from "./client";
import { VEHICLE_TELEMETRY_TTL_SECONDS, expiresAtFrom } from "./ttl";

/** Flattens a telemetry snapshot into a stored history row, or null when the
 *  snapshot has no position (such a point would draw a line to 0,0). */
export function toPoint(vehicleId: string, s: VehicleState): TelemetryPoint | null {
  const sum = summarize(s);
  if (!sum?.pos) return null;
  return {
    vehicleId,
    t: s.t,
    lat: sum.pos.lat,
    lon: sum.pos.lon,
    alt: sum.pos.alt,
    rel: sum.pos.rel,
    hdg: sum.hdg,
    gs: sum.gs,
    batPct: sum.batPct,
    batV: sum.batV,
    mode: sum.mode,
    armed: sum.armed,
    sats: sum.sats,
    fix: sum.fix,
    expiresAt: expiresAtFrom(s.t, VEHICLE_TELEMETRY_TTL_SECONDS),
  };
}

/** Appends downsampled history points for a vehicle. */
export async function putPoints(vehicleId: string, states: VehicleState[]): Promise<void> {
  const points = states.map((s) => toPoint(vehicleId, s)).filter((p): p is TelemetryPoint => p !== null);
  if (points.length === 0) return;
  await batchPutAll(TABLES.CC_VEHICLE_TELEMETRY, points as unknown as Record<string, unknown>[]);
}

/** Reads a vehicle's recent flight-path window, oldest-first for charting. */
export async function listPoints(
  vehicleId: string,
  opts: { since?: number; limit: number }
): Promise<TelemetryPoint[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_VEHICLE_TELEMETRY,
      KeyConditionExpression: `vehicleId = :vid${opts.since === undefined ? "" : " AND #t >= :since"}`,
      ...(opts.since === undefined ? {} : { ExpressionAttributeNames: { "#t": "t" } }),
      ExpressionAttributeValues: {
        ":vid": vehicleId,
        ...(opts.since === undefined ? {} : { ":since": opts.since }),
      },
      // Newest first from the table, capped, then reversed to chronological.
      ScanIndexForward: false,
      Limit: opts.limit,
    })
  );
  const rows = (res.Items ?? []) as TelemetryPoint[];
  return rows.reverse();
}
