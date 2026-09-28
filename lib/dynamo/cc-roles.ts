import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import type { Role } from "@/lib/control-center/access";
import { ddb, paginatedScan, TABLES } from "./client";

export interface RoleRecord {
  userId: string;
  role: Role;
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

export async function setRole(userId: string, role: Role, updatedBy: string): Promise<RoleRecord> {
  const rec: RoleRecord = { userId, role, updatedAt: Date.now(), updatedBy };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_ROLES, Item: rec }));
  return rec;
}

/** Removes the explicit role: the user falls back to akade-users.isAdmin. */
export async function clearRole(userId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_ROLES, Key: { userId } }));
}
