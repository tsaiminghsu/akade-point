import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { ddb, TABLES } from "./client";
import type { Widget } from "@/lib/control-center/types";

export interface CCLayoutVersion {
  storeId: string;
  id: string;
  name: string;
  savedAt: number; // epoch ms
  widgets: Widget[];
}

export async function listVersionsByStore(storeId: string): Promise<CCLayoutVersion[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_LAYOUT_VERSIONS,
      KeyConditionExpression: "storeId = :sid",
      ExpressionAttributeValues: { ":sid": storeId },
    })
  );
  return (res.Items ?? []) as CCLayoutVersion[];
}

export async function getVersion(storeId: string, id: string): Promise<CCLayoutVersion | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_LAYOUT_VERSIONS, Key: { storeId, id } }));
  return (res.Item as CCLayoutVersion) ?? null;
}

export async function createVersion(storeId: string, name: string, widgets: Widget[]): Promise<CCLayoutVersion> {
  const version: CCLayoutVersion = { storeId, id: createId(), name, savedAt: Date.now(), widgets };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_LAYOUT_VERSIONS, Item: version }));
  return version;
}

export async function updateVersionWidgets(storeId: string, id: string, widgets: Widget[]): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_LAYOUT_VERSIONS,
      Key: { storeId, id },
      UpdateExpression: "SET widgets = :w, savedAt = :now",
      ExpressionAttributeValues: { ":w": widgets, ":now": Date.now() },
    })
  );
}

export async function renameVersion(storeId: string, id: string, name: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_LAYOUT_VERSIONS,
      Key: { storeId, id },
      UpdateExpression: "SET #n = :n",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: { ":n": name },
    })
  );
}

/** Blocks (returns false) if this is the store's only remaining version. */
export async function deleteVersion(storeId: string, id: string): Promise<boolean> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_LAYOUT_VERSIONS,
      KeyConditionExpression: "storeId = :sid",
      ExpressionAttributeValues: { ":sid": storeId },
      Select: "COUNT",
    })
  );
  if ((res.Count ?? 0) <= 1) return false;

  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_LAYOUT_VERSIONS, Key: { storeId, id } }));
  return true;
}
