import { QueryCommand } from "@aws-sdk/lib-dynamodb";

import type { TelemetryPoint, VehicleState } from "@/lib/control-center/vehicles/types";
import { batchPutAll } from "./batch";
import { ddb, TABLES } from "./client";
import { VEHICLE_TELEMETRY_TTL_SECONDS, expiresAtFrom } from "./ttl";

/** Flattens a telemetry snapshot into a stored history row. */
export function toPoint(vehicleId: string, s: VehicleState): TelemetryPoint {
  return {
    vehicleId,
    t: s.t,
    lat: s.pos.lat,
    lon: s.pos.lon,
    alt: s.pos.alt,
    rel: s.pos.rel,
    hdg: s.hdg,
    gs: s.gs,
    batPct: s.bat.pct,
    batV: s.bat.v,
    mode: s.mode,
    armed: s.armed,
    sats: s.gps.sats,
    fix: s.gps.fix,
    expiresAt: expiresAtFrom(s.t, VEHICLE_TELEMETRY_TTL_SECONDS),
  };
}

/** Appends downsampled history points for a vehicle. */
export async function putPoints(vehicleId: string, states: VehicleState[]): Promise<void> {
  if (states.length === 0) return;
  const points = states.map((s) => toPoint(vehicleId, s));
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
