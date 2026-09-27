import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLES } from "./client";

/**
 * A full parameter table read off a vehicle. Kept as history so the ground
 * station can show what changed and compare against an earlier state. An
 * ArduCopter table (~1,300 parameters) is about 40 KB, well under DynamoDB's
 * 400 KB item limit.
 */
export interface CCParamSnapshot {
  vehicleId: string;
  capturedAt: number;
  /** name → [value, MAV_PARAM_TYPE] */
  params: Record<string, [number, number]>;
  count: number;
  fw: string | null;
  commandId: string | null;
}

export type CCParamSnapshotMeta = Omit<CCParamSnapshot, "params" | "vehicleId">;

export async function putSnapshot(s: CCParamSnapshot): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLES.CC_VEHICLE_PARAMS, Item: s }));
}

/** Newest first, without the tables themselves. */
export async function listSnapshots(vehicleId: string, limit = 30): Promise<CCParamSnapshotMeta[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_VEHICLE_PARAMS,
      KeyConditionExpression: "vehicleId = :v",
      ExpressionAttributeValues: { ":v": vehicleId },
      ProjectionExpression: "capturedAt, #c, fw, commandId",
      ExpressionAttributeNames: { "#c": "count" },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (res.Items ?? []) as CCParamSnapshotMeta[];
}

export async function getSnapshot(vehicleId: string, capturedAt: number): Promise<CCParamSnapshot | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_VEHICLE_PARAMS, Key: { vehicleId, capturedAt } }));
  return (res.Item as CCParamSnapshot) ?? null;
}
