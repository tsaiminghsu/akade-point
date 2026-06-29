import {
  GetCommand,
  UpdateCommand,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./client";
import { createId } from "@paralleldrive/cuid2";

export type Rarity = "N" | "R" | "SR" | "SSR";

export interface PhysicalCard {
  qrToken: string;
  serialNumber: string;
  cardNumber: string;
  nameZh: string;
  nameEn: string;
  rarity: Rarity;
  basePoints: number;
  imageKey?: string;
  isRegistered: boolean;
  registeredBy?: string;
  printBatch?: string;
  createdAt: string;
}

export const CARD_TYPES: Record<
  string,
  { nameZh: string; nameEn: string; rarity: Rarity; basePoints: number }
> = {
  "001": { nameZh: "探索機器人", nameEn: "Explorer Robot", rarity: "N", basePoints: 100 },
  "002": { nameZh: "分析機器人", nameEn: "Analysis Robot", rarity: "N", basePoints: 200 },
  "003": { nameZh: "守護機器人", nameEn: "Guardian Robot", rarity: "R", basePoints: 300 },
  "004": { nameZh: "能源機器人", nameEn: "Energy Robot", rarity: "R", basePoints: 500 },
  "005": { nameZh: "星際機器人", nameEn: "Stellar Robot", rarity: "SR", basePoints: 1000 },
};

export async function getCardByToken(qrToken: string): Promise<PhysicalCard | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLES.CARDS, Key: { qrToken } })
  );
  return (res.Item as PhysicalCard) ?? null;
}

export async function markCardRegistered(
  qrToken: string,
  registeredBy: string
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CARDS,
      Key: { qrToken },
      UpdateExpression: "SET isRegistered = :t, registeredBy = :uid",
      ConditionExpression: "isRegistered = :f",
      ExpressionAttributeValues: {
        ":t": true,
        ":f": false,
        ":uid": registeredBy,
      },
    })
  );
}

export async function batchCreateCards(
  cardNumber: string,
  quantity: number,
  printBatch: string
): Promise<PhysicalCard[]> {
  const cardType = CARD_TYPES[cardNumber];
  if (!cardType) throw new Error(`Unknown card number: ${cardNumber}`);

  const cards: PhysicalCard[] = Array.from({ length: quantity }, (_, i) => ({
    qrToken: createId(),
    serialNumber: `${printBatch}-${cardNumber}-${String(i + 1).padStart(4, "0")}`,
    cardNumber,
    ...cardType,
    isRegistered: false,
    printBatch,
    createdAt: new Date().toISOString(),
  }));

  // DynamoDB batch write: max 25 per request
  for (let i = 0; i < cards.length; i += 25) {
    const chunk = cards.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLES.CARDS]: chunk.map((card) => ({
            PutRequest: { Item: card },
          })),
        },
      })
    );
  }
  return cards;
}

export async function listCards(registeredOnly?: boolean): Promise<PhysicalCard[]> {
  const params = registeredOnly !== undefined
    ? {
        TableName: TABLES.CARDS,
        FilterExpression: "isRegistered = :r",
        ExpressionAttributeValues: { ":r": registeredOnly },
      }
    : { TableName: TABLES.CARDS };

  const res = await ddb.send(new ScanCommand(params));
  return (res.Items ?? []) as PhysicalCard[];
}
