import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";

import { buildUpdateExpression, ddb, paginatedScan, TABLES } from "./client";

/** Server-side vehicle record. `state` is the latest telemetry snapshot; the
 *  bounded history lives in the telemetry table. `linkState` is not stored. */
export interface CCVehicle {
  id: string;
  name: string;
  type: "drone" | "rover";
  companionId: string;
  notes: string;
  state: Record<string, unknown> | null;
  stateAt: number | null;
  lastSeenAt: number | null;
  /** last time a ground-station page holding control polled this vehicle (ms) */
  operatorSeenAt?: number;
  /** companion WebSocket for the direct link, e.g. wss://drone.tailnet.ts.net */
  directUrl?: string;
  /** WebRTC (WHEP) video endpoint served by MediaMTX on the companion */
  videoUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type CCVehicleInput = {
  name: string;
  type: "drone" | "rover";
  companionId: string;
  notes?: string;
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
): Promise<{ operatorSeenAt: number | null }> {
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
  const at = (res.Attributes as { operatorSeenAt?: number } | undefined)?.operatorSeenAt;
  return { operatorSeenAt: typeof at === "number" ? at : null };
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

export async function deleteVehicle(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_VEHICLES, Key: { id } }));
}
