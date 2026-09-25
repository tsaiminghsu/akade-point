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
 *  without bumping updatedAt (which is for operator edits, not telemetry). */
export async function updateVehicleState(
  id: string,
  state: Record<string, unknown>,
  stateAt: number,
  lastSeenAt: number
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_VEHICLES,
      Key: { id },
      UpdateExpression: "SET #st = :st, stateAt = :sa, lastSeenAt = :ls",
      ExpressionAttributeNames: { "#st": "state" },
      ExpressionAttributeValues: { ":st": state, ":sa": stateAt, ":ls": lastSeenAt },
    })
  );
}

export async function deleteVehicle(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_VEHICLES, Key: { id } }));
}
