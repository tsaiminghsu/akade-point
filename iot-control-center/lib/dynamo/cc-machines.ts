import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { buildUpdateExpression, ddb, paginatedScan, TABLES } from "./client";

export type CCMachineStatus = "online" | "warning" | "alarm" | "offline";
export type CCDoorState = "closed" | "open";

export interface CCMachine {
  id: string;
  name: string;
  deviceId: string;
  storeId: string;
  groupId: string;
  status: CCMachineStatus;
  current: number; // amps
  door: CCDoorState;
  doorOpenSince: number | null; // epoch ms
  heartbeatAt: number; // epoch ms
  rssi: number; // dBm
  firmware: string;
  restartCount: number;
  lastUpdate: number; // epoch ms
  currentHistory: { t: number; value: number }[];
}

export async function listMachines(): Promise<CCMachine[]> {
  return paginatedScan<CCMachine>(TABLES.CC_MACHINES);
}

export async function listMachinesByStore(storeId: string): Promise<CCMachine[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_MACHINES,
      IndexName: "store-group-index",
      KeyConditionExpression: "storeId = :sid",
      ExpressionAttributeValues: { ":sid": storeId },
    })
  );
  return (res.Items ?? []) as CCMachine[];
}

export async function listMachinesByGroup(storeId: string, groupId: string): Promise<CCMachine[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_MACHINES,
      IndexName: "store-group-index",
      KeyConditionExpression: "storeId = :sid AND groupId = :gid",
      ExpressionAttributeValues: { ":sid": storeId, ":gid": groupId },
    })
  );
  return (res.Items ?? []) as CCMachine[];
}

export async function getMachine(id: string): Promise<CCMachine | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_MACHINES, Key: { id } }));
  return (res.Item as CCMachine) ?? null;
}

export async function createMachine(data: Omit<CCMachine, "id">): Promise<CCMachine> {
  const machine: CCMachine = { id: createId(), ...data };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_MACHINES, Item: machine }));
  return machine;
}

export async function updateMachine(id: string, patch: Partial<Omit<CCMachine, "id">>): Promise<void> {
  const update = buildUpdateExpression(patch);
  if (!update) return;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_MACHINES,
      Key: { id },
      ...update,
    })
  );
}

/**
 * Not guarded — widgets on the Layout Editor canvas render an "Unbound"
 * placeholder when their machineId no longer resolves, so deleting a
 * machine that's still placed on the canvas is safe.
 */
export async function deleteMachine(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_MACHINES, Key: { id } }));
}
