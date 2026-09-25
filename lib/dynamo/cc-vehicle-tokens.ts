import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLES } from "./client";

/** A device token row. Only the sha256 hash of the full token is stored. */
export interface CCVehicleToken {
  tokenId: string;
  vehicleId: string;
  hash: string;
  label: string;
  createdAt: number;
  revokedAt?: number;
}

export async function getToken(tokenId: string): Promise<CCVehicleToken | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_VEHICLE_TOKENS, Key: { tokenId } }));
  return (res.Item as CCVehicleToken) ?? null;
}

export async function putToken(token: CCVehicleToken): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLES.CC_VEHICLE_TOKENS, Item: token }));
}

export async function listTokensByVehicle(vehicleId: string): Promise<CCVehicleToken[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_VEHICLE_TOKENS,
      IndexName: "vehicle-index",
      KeyConditionExpression: "vehicleId = :vid",
      ExpressionAttributeValues: { ":vid": vehicleId },
    })
  );
  return (res.Items ?? []) as CCVehicleToken[];
}

/** Revokes every currently-active token for a vehicle (used on rotation and on
 *  vehicle delete). Rotation is deliberately non-overlapping in the MVP. */
export async function revokeAllForVehicle(vehicleId: string, now: number = Date.now()): Promise<void> {
  const tokens = await listTokensByVehicle(vehicleId);
  await Promise.all(
    tokens
      .filter((t) => t.revokedAt === undefined)
      .map((t) =>
        ddb.send(
          new UpdateCommand({
            TableName: TABLES.CC_VEHICLE_TOKENS,
            Key: { tokenId: t.tokenId },
            UpdateExpression: "SET revokedAt = :now",
            ExpressionAttributeValues: { ":now": now },
          })
        )
      )
  );
}
