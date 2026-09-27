import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { ddb, paginatedScan, TABLES } from "./client";

export interface CCMaintenanceRecord {
  id: string;
  machineId: string;
  date: number; // epoch ms
  description: string;
  technician: string;
}

export async function createMaintenanceRecord(data: Omit<CCMaintenanceRecord, "id">): Promise<CCMaintenanceRecord> {
  const record: CCMaintenanceRecord = { id: createId(), ...data };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_MAINTENANCE_RECORDS, Item: record }));
  return record;
}

export async function listMaintenanceRecords(): Promise<CCMaintenanceRecord[]> {
  return paginatedScan<CCMaintenanceRecord>(TABLES.CC_MAINTENANCE_RECORDS);
}

export async function listMaintenanceByMachine(machineId: string): Promise<CCMaintenanceRecord[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_MAINTENANCE_RECORDS,
      IndexName: "machine-index",
      KeyConditionExpression: "machineId = :mid",
      ExpressionAttributeValues: { ":mid": machineId },
      ScanIndexForward: false,
    })
  );
  return (res.Items ?? []) as CCMaintenanceRecord[];
}
