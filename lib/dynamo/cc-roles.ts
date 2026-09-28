import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { cleanStoreRoles, isRole, type Role, type StoreRole } from "@/lib/control-center/access";
import { ddb, paginatedScan, TABLES } from "./client";

/**
 * A user's Control Center grants. `role` is global (every store, and what
 * belongs to no store); without it the akade-users isAdmin flag decides.
 * `stores` grants a role at single stores (docs/permissions.md).
 */
export interface RoleRecord {
  userId: string;
  role?: Role;
  stores?: Record<string, StoreRole>;
  updatedAt: number;
  updatedBy: string;
}

export async function getRole(userId: string): Promise<RoleRecord | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_ROLES, Key: { userId } }));
  return (res.Item as RoleRecord) ?? null;
}

export async function listRoles(): Promise<RoleRecord[]> {
  return paginatedScan<RoleRecord>(TABLES.CC_ROLES);
}

/**
 * Writes a user's grants. `role: null` drops the explicit global role (back
 * to isAdmin); with no global role and no store grants the record is deleted.
 */
export async function setGrants(
  userId: string,
  grants: { role: Role | null; stores: Record<string, StoreRole> },
  updatedBy: string
): Promise<RoleRecord | null> {
  const stores = cleanStoreRoles(grants.stores);
  const role = isRole(grants.role) ? grants.role : undefined;
  if (!role && Object.keys(stores).length === 0) {
    await clearRole(userId);
    return null;
  }
  const rec: RoleRecord = { userId, updatedAt: Date.now(), updatedBy, ...(role && { role }), ...(Object.keys(stores).length && { stores }) };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_ROLES, Item: rec }));
  return rec;
}

export async function setRole(userId: string, role: Role, updatedBy: string): Promise<RoleRecord | null> {
  const prev = await getRole(userId);
  return setGrants(userId, { role, stores: prev?.stores ?? {} }, updatedBy);
}

/** Removes every explicit grant: the user falls back to akade-users.isAdmin. */
export async function clearRole(userId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_ROLES, Key: { userId } }));
}

const conditionFailed = (err: unknown) => (err as { name?: string }).name === "ConditionalCheckFailedException";

/**
 * Sets (or with null removes) one store's role in a user's grants, leaving
 * the rest of the record alone: two admins changing the same person at
 * different stores cannot overwrite each other, as a read-modify-write of
 * the whole map could.
 */
export async function setStoreRole(userId: string, storeId: string, role: StoreRole | null, updatedBy: string): Promise<void> {
  const names = { "#s": "stores", "#id": storeId };
  const now = Date.now();
  if (role === null) {
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.CC_ROLES,
          Key: { userId },
          UpdateExpression: "REMOVE #s.#id SET updatedAt = :t, updatedBy = :by",
          ConditionExpression: "attribute_exists(#s.#id)",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: { ":t": now, ":by": updatedBy },
        })
      );
    } catch (err) {
      if (!conditionFailed(err)) throw err; // nothing to remove
    }
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // The usual case: the record already has a stores map.
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.CC_ROLES,
          Key: { userId },
          UpdateExpression: "SET #s.#id = :r, updatedAt = :t, updatedBy = :by",
          ConditionExpression: "attribute_exists(#s)",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: { ":r": role, ":t": now, ":by": updatedBy },
        })
      );
      return;
    } catch (err) {
      if (!conditionFailed(err)) throw err;
    }
    try {
      // No map yet (or no record at all): create it, unless someone just did.
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.CC_ROLES,
          Key: { userId },
          UpdateExpression: "SET #s = :m, updatedAt = :t, updatedBy = :by",
          ConditionExpression: "attribute_not_exists(#s)",
          ExpressionAttributeNames: { "#s": "stores" },
          ExpressionAttributeValues: { ":m": { [storeId]: role }, ":t": now, ":by": updatedBy },
        })
      );
      return;
    } catch (err) {
      if (!conditionFailed(err)) throw err;
    }
  }
  throw new Error("setStoreRole: kept racing with other writers");
}

/** Everyone with a role at `storeId` (store grant) or a global role, from the roles table. */
export async function listStoreMembers(storeId: string): Promise<RoleRecord[]> {
  const out: RoleRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLES.CC_ROLES,
        FilterExpression: "attribute_exists(#s.#id) OR attribute_exists(#r)",
        ExpressionAttributeNames: { "#s": "stores", "#id": storeId, "#r": "role" },
        ExclusiveStartKey: startKey,
      })
    );
    out.push(...((res.Items ?? []) as RoleRecord[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return out;
}
