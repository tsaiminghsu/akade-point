import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

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
