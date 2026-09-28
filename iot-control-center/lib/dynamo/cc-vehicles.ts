import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";

import { LEASE_TTL_MS, type ControlLease } from "@/lib/control-center/vehicles/lease";

import { buildUpdateExpression, ddb, paginatedScan, TABLES } from "./client";

/** Server-side vehicle record. `state` is the latest telemetry snapshot; the
 *  bounded history lives in the telemetry table. `linkState` is not stored. */
export interface CCVehicle {
  id: string;
  name: string;
  type: "drone" | "rover";
  companionId: string;
  notes: string;
  /** the store it belongs to; its roles apply (docs/permissions.md). "" / absent = no store: global roles only */
  storeId?: string;
  state: Record<string, unknown> | null;
  stateAt: number | null;
  lastSeenAt: number | null;
  /** last time a ground-station page holding control polled this vehicle (ms) */
  operatorSeenAt?: number;
  /** companion WebSocket for the direct link, e.g. wss://drone.tailnet.ts.net */
  directUrl?: string;
  /** WebRTC (WHEP) video endpoint served by MediaMTX on the companion */
  videoUrl?: string;
  /** who holds control right now (see lib/control-center/vehicles/lease.ts) */
  controlLease?: ControlLease;
  createdAt: number;
  updatedAt: number;
}

export type CCVehicleInput = {
  name: string;
  type: "drone" | "rover";
  companionId: string;
  notes?: string;
  storeId?: string;
};

export async function listVehicles(): Promise<CCVehicle[]> {
  return paginatedScan<CCVehicle>(TABLES.CC_VEHICLES);
}

export async function getVehicle(id: string): Promise<CCVehicle | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_VEHICLES, Key: { id } }));
  return (res.Item as CCVehicle) ?? null;
}

export async function getVehicleByCompanionId(companionId: string): Promise<CCVehicle | null> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_VEHICLES,
      IndexName: "companion-index",
      KeyConditionExpression: "companionId = :cid",
      ExpressionAttributeValues: { ":cid": companionId },
      Limit: 1,
    })
  );
  return ((res.Items ?? [])[0] as CCVehicle) ?? null;
}

export async function createVehicle(input: CCVehicleInput): Promise<CCVehicle> {
  const now = Date.now();
  const vehicle: CCVehicle = {
    id: createId(),
    name: input.name,
    type: input.type,
    companionId: input.companionId,
    notes: input.notes ?? "",
    ...(input.storeId && { storeId: input.storeId }),
    state: null,
    stateAt: null,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_VEHICLES, Item: vehicle }));
  return vehicle;
}

export async function updateVehicle(id: string, patch: Partial<Omit<CCVehicle, "id">>): Promise<void> {
  const update = buildUpdateExpression({ ...patch, updatedAt: Date.now() });
  if (!update) return;
  await ddb.send(new UpdateCommand({ TableName: TABLES.CC_VEHICLES, Key: { id }, ...update }));
}

/** Fast path used by the telemetry ingest route: overwrite live state + timers
 *  without bumping updatedAt (which is for operator edits, not telemetry).
 *  Returns when a ground-station page last watched this vehicle. */
export async function updateVehicleState(
  id: string,
  state: Record<string, unknown>,
  stateAt: number,
  lastSeenAt: number
): Promise<{ operatorSeenAt: number | null; controlLease: ControlLease | null }> {
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_VEHICLES,
      Key: { id },
      UpdateExpression: "SET #st = :st, stateAt = :sa, lastSeenAt = :ls",
      ExpressionAttributeNames: { "#st": "state" },
      ExpressionAttributeValues: { ":st": state, ":sa": stateAt, ":ls": lastSeenAt },
      // One round trip: the write also hands back operatorSeenAt.
      ReturnValues: "ALL_NEW",
    })
  );
  const attrs = res.Attributes as { operatorSeenAt?: number; controlLease?: ControlLease } | undefined;
  return { operatorSeenAt: typeof attrs?.operatorSeenAt === "number" ? attrs.operatorSeenAt : null, controlLease: attrs?.controlLease ?? null };
}

/** Stamps that a ground-station page is watching this vehicle right now. */
export async function markOperatorSeen(id: string, at: number): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_VEHICLES,
      Key: { id },
      UpdateExpression: "SET operatorSeenAt = :at",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeValues: { ":at": at },
    })
  );
}

/**
 * Takes or renews control. Succeeds when nobody holds it, the lease ran out,
 * the caller already holds it, or `force` (a deliberate takeover). Returns
 * the lease in force afterwards and whether the caller holds it.
 */
export async function acquireLease(
  id: string,
  who: { cid: string; sub: string; name: string },
  now: number,
  force = false
): Promise<{ held: boolean; lease: ControlLease | null }> {
  const current = (await getVehicle(id))?.controlLease;
  const since = current && current.cid === who.cid && current.until > now ? current.since : now;
  const lease: ControlLease = { ...who, since, until: now + LEASE_TTL_MS };
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.CC_VEHICLES,
        Key: { id },
        UpdateExpression: "SET controlLease = :l",
        ConditionExpression: force
          ? "attribute_exists(id)"
          : "attribute_exists(id) AND (attribute_not_exists(controlLease) OR controlLease.#u < :now OR controlLease.cid = :cid)",
        ...(force ? {} : { ExpressionAttributeNames: { "#u": "until" } }),
        ExpressionAttributeValues: force ? { ":l": lease } : { ":l": lease, ":now": now, ":cid": who.cid },
      })
    );
    return { held: true, lease };
  } catch (err) {
    if ((err as { name?: string }).name !== "ConditionalCheckFailedException") throw err;
    return { held: false, lease: (await getVehicle(id))?.controlLease ?? null };
  }
}

/** Gives control back; only the holder's release counts. */
export async function releaseLease(id: string, cid: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.CC_VEHICLES,
        Key: { id },
        UpdateExpression: "REMOVE controlLease",
        ConditionExpression: "controlLease.cid = :cid",
        ExpressionAttributeValues: { ":cid": cid },
      })
    );
  } catch (err) {
    if ((err as { name?: string }).name !== "ConditionalCheckFailedException") throw err;
  }
}

export async function deleteVehicle(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_VEHICLES, Key: { id } }));
}
