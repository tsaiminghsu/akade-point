import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { FileGeo, VehicleFileKind } from "@/lib/control-center/vehicles/files";
import { ddb, TABLES } from "./client";

/**
 * A vehicle file in cloud storage (lib/vehicle-files/storage.ts). The record
 * is written when the companion announces the file ("pending") and marked
 * "stored" once the upload is confirmed; only stored files are shown.
 * `fileId` (lib/control-center/vehicles/files.ts) sorts by kind, then time.
 */
export interface CCVehicleFile {
  vehicleId: string;
  fileId: string;
  kind: VehicleFileKind;
  name: string;
  bytes: number;
  sha256: string;
  t: number;
  geo?: FileGeo;
  status: "pending" | "stored";
  key: string;
  createdAt: number;
  storedAt?: number;
  /** DynamoDB TTL, epoch seconds */
  expiresAt?: number;
}

export async function getFile(vehicleId: string, fileId: string): Promise<CCVehicleFile | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_VEHICLE_FILES, Key: { vehicleId, fileId } }));
  return (res.Item as CCVehicleFile) ?? null;
}

/** Writes (or rewrites) a pending record; a stored one is left alone. Returns false if it was already stored. */
export async function putPending(f: Omit<CCVehicleFile, "status" | "createdAt">): Promise<boolean> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLES.CC_VEHICLE_FILES,
        Item: { ...f, status: "pending", createdAt: Date.now() },
        ConditionExpression: "attribute_not_exists(fileId) OR #s = :p",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":p": "pending" },
      })
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

export async function markStored(vehicleId: string, fileId: string, storedAt: number, expiresAt: number): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_VEHICLE_FILES,
      Key: { vehicleId, fileId },
      UpdateExpression: "SET #s = :s, storedAt = :at, expiresAt = :exp",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "stored", ":at": storedAt, ":exp": expiresAt },
    })
  );
}

/** Newest first within one kind; `before` is an exclusive fileId bound for paging. */
export async function listFiles(vehicleId: string, kind: VehicleFileKind, opts: { before?: string; limit: number }): Promise<CCVehicleFile[]> {
  const out: CCVehicleFile[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.CC_VEHICLE_FILES,
        KeyConditionExpression: "vehicleId = :v AND fileId BETWEEN :lo AND :hi",
        FilterExpression: "#s = :stored",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":v": vehicleId, ":lo": `${kind}.`, ":hi": opts.before ?? `${kind}.~`, ":stored": "stored" },
        ScanIndexForward: false,
        Limit: opts.limit + 1,
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of (res.Items ?? []) as CCVehicleFile[]) if (item.fileId !== opts.before) out.push(item);
    startKey = res.LastEvaluatedKey;
  } while (startKey && out.length < opts.limit);
  return out.slice(0, opts.limit);
}

/** Every record of a vehicle (any status), for cleanup when the vehicle is deleted. */
export async function listAllForVehicle(vehicleId: string): Promise<CCVehicleFile[]> {
  const out: CCVehicleFile[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.CC_VEHICLE_FILES,
        KeyConditionExpression: "vehicleId = :v",
        ExpressionAttributeValues: { ":v": vehicleId },
        ExclusiveStartKey: startKey,
      })
    );
    out.push(...((res.Items ?? []) as CCVehicleFile[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return out;
}

export async function deleteFile(vehicleId: string, fileId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_VEHICLE_FILES, Key: { vehicleId, fileId } }));
}
