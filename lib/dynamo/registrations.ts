import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./client";
import { createId } from "@paralleldrive/cuid2";
import type { Rarity } from "./cards";

export type RewardChoice = "POINTS" | "TICKET";

export interface Registration {
  userId: string;
  registrationId: string;
  qrToken: string;
  cardNumber: string;
  rarity: Rarity;
  nameZh: string;
  shopCode: string;
  shopName: string;
  choice: RewardChoice;
  pointsAwarded: number;
  registeredAt: string;
}

export async function createRegistration(
  data: Omit<Registration, "registrationId">
): Promise<Registration> {
  const registration: Registration = {
    ...data,
    registrationId: createId(),
  };
  await ddb.send(
    new PutCommand({ TableName: TABLES.REGISTRATIONS, Item: registration })
  );
  return registration;
}

export async function getUserRegistrations(userId: string): Promise<Registration[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.REGISTRATIONS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ScanIndexForward: false,
    })
  );
  return (res.Items ?? []) as Registration[];
}

export async function isTokenRegistered(qrToken: string): Promise<boolean> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.REGISTRATIONS,
      IndexName: "qrtoken-index",
      KeyConditionExpression: "qrToken = :t",
      ExpressionAttributeValues: { ":t": qrToken },
      Limit: 1,
    })
  );
  return (res.Count ?? 0) > 0;
}
