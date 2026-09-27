import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLES } from "./client";

/** A claw machine board's device token. Only the sha256 of the full token is stored. */
export interface CCMachineToken {
  tokenId: string;
  machineId: string;
  hash: string;
  label: string;
  createdAt: number;
  revokedAt?: number;
}

export async function getMachineToken(tokenId: string): Promise<CCMachineToken | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_MACHINE_TOKENS, Key: { tokenId } }));
  return (res.Item as CCMachineToken) ?? null;
}

export async function putMachineToken(token: CCMachineToken): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLES.CC_MACHINE_TOKENS, Item: token }));
}

export async function listTokensByMachine(machineId: string): Promise<CCMachineToken[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_MACHINE_TOKENS,
      IndexName: "machine-index",
      KeyConditionExpression: "machineId = :mid",
      ExpressionAttributeValues: { ":mid": machineId },
    })
  );
  return (res.Items ?? []) as CCMachineToken[];
}

/** Revokes every active token for a machine (on rotation, disconnect and machine delete). */
export async function revokeAllForMachine(machineId: string, now: number = Date.now()): Promise<number> {
  const active = (await listTokensByMachine(machineId)).filter((t) => t.revokedAt === undefined);
  await Promise.all(
    active.map((t) =>
      ddb.send(
        new UpdateCommand({
          TableName: TABLES.CC_MACHINE_TOKENS,
          Key: { tokenId: t.tokenId },
          UpdateExpression: "SET revokedAt = :now",
          ExpressionAttributeValues: { ":now": now },
        })
      )
    )
  );
  return active.length;
}
