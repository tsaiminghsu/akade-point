import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { buildUpdateExpression, ddb, hasAnyDependent, paginatedScan, TABLES } from "./client";

export interface CCMachineGroup {
  id: string;
  name: string;
  storeId: string;
}

export async function listGroups(): Promise<CCMachineGroup[]> {
  return paginatedScan<CCMachineGroup>(TABLES.CC_GROUPS);
}

export async function listGroupsByStore(storeId: string): Promise<CCMachineGroup[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_GROUPS,
      IndexName: "store-index",
      KeyConditionExpression: "storeId = :sid",
      ExpressionAttributeValues: { ":sid": storeId },
    })
  );
  return (res.Items ?? []) as CCMachineGroup[];
}

export async function getGroup(id: string): Promise<CCMachineGroup | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_GROUPS, Key: { id } }));
  return (res.Item as CCMachineGroup) ?? null;
}

export async function createGroup(data: Omit<CCMachineGroup, "id">): Promise<CCMachineGroup> {
  const group: CCMachineGroup = { id: createId(), ...data };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_GROUPS, Item: group }));
  return group;
}

export async function updateGroup(id: string, patch: Partial<Omit<CCMachineGroup, "id">>): Promise<void> {
  const update = buildUpdateExpression(patch);
  if (!update) return;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_GROUPS,
      Key: { id },
      ...update,
    })
  );
}

/** Blocks (returns false) if any machine still belongs to this group. */
export async function deleteGroup(id: string): Promise<boolean> {
  const group = await getGroup(id);
  if (!group) return true;

  const blocked = await hasAnyDependent(
    TABLES.CC_MACHINES,
    "store-group-index",
    "storeId = :sid AND groupId = :gid",
    { ":sid": group.storeId, ":gid": id }
  );
  if (blocked) return false;

  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_GROUPS, Key: { id } }));
  return true;
}
