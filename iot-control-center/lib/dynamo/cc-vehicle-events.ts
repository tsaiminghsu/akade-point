import { QueryCommand } from "@aws-sdk/lib-dynamodb";

import { eventSortKey } from "@/lib/control-center/vehicles/eventKey";
import type { VehicleEvent } from "@/lib/control-center/vehicles/types";
import { batchPutAll } from "./batch";
import { ddb, TABLES } from "./client";
import { VEHICLE_EVENT_TTL_SECONDS, expiresAtFrom } from "./ttl";

export interface IncomingStatusMessage {
  seq: number;
  t: number;
  sev: number;
  text: string;
  comp: number;
}

export { eventSortKey };

export function toEvent(vehicleId: string, m: IncomingStatusMessage): VehicleEvent {
  return {
    vehicleId,
    sk: eventSortKey(m.t, m.seq),
    t: m.t,
    sev: m.sev,
    text: m.text,
    comp: m.comp,
    expiresAt: expiresAtFrom(m.t, VEHICLE_EVENT_TTL_SECONDS),
  };
}

export async function putEvents(vehicleId: string, msgs: IncomingStatusMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  // A retried POST can repeat messages; identical keys in one batch are an
  // error in DynamoDB, so collapse them first.
  const byKey = new Map(msgs.map((m) => [eventSortKey(m.t, m.seq), toEvent(vehicleId, m)]));
  await batchPutAll(TABLES.CC_VEHICLE_EVENTS, [...byKey.values()] as unknown as Record<string, unknown>[]);
}

/**
 * Events newer than `after` (an sk cursor), oldest first. Without a cursor,
 * the newest `limit` events, still returned oldest first.
 */
export async function listEvents(vehicleId: string, opts: { after?: string; limit: number }): Promise<VehicleEvent[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_VEHICLE_EVENTS,
      KeyConditionExpression: `vehicleId = :vid${opts.after ? " AND sk > :after" : ""}`,
      ExpressionAttributeValues: { ":vid": vehicleId, ...(opts.after ? { ":after": opts.after } : {}) },
      ScanIndexForward: Boolean(opts.after),
      Limit: opts.limit,
    })
  );
  const rows = (res.Items ?? []) as VehicleEvent[];
  return opts.after ? rows : rows.reverse();
}
