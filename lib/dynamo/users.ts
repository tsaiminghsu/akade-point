import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./client";

export interface InventoryItem {
  itemId: string;
  name: string;
  rarity: "UR" | "SSR" | "SR" | "R";
  desc: string;
  claimedAt: string;
}

export interface User {
  userId: string;
  displayName?: string;
  email?: string;
  lineImage?: string;
  totalPoints: number;
  ticketCount: number;
  isAdmin: boolean;
  entityType: "USER";
  createdAt: string;
  updatedAt: string;
  inventory?: InventoryItem[];
}

export async function getUser(userId: string): Promise<User | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLES.USERS, Key: { userId } })
  );
  return (res.Item as User) ?? null;
}

export async function createUser(
  userId: string,
  data: { displayName?: string; email?: string; lineImage?: string }
): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    userId,
    displayName: data.displayName,
    email: data.email,
    lineImage: data.lineImage,
    totalPoints: 0,
    ticketCount: 0,
    isAdmin: false,
    entityType: "USER",
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLES.USERS,
      Item: user,
      ConditionExpression: "attribute_not_exists(userId)",
    })
  );
  return user;
}

export async function upsertUser(
  userId: string,
  data: { displayName?: string; email?: string; lineImage?: string }
): Promise<void> {
  const existing = await getUser(userId);
  if (existing) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId },
        UpdateExpression:
          "SET displayName = :dn, lineImage = :img, updatedAt = :now",
        ExpressionAttributeValues: {
          ":dn": data.displayName ?? existing.displayName,
          ":img": data.lineImage ?? existing.lineImage,
          ":now": new Date().toISOString(),
        },
      })
    );
  } else {
    await createUser(userId, data);
  }
}

export async function addPoints(userId: string, points: number): Promise<number> {
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { userId },
      UpdateExpression:
        "ADD totalPoints :p SET updatedAt = :now, entityType = :et",
      ExpressionAttributeValues: {
        ":p": points,
        ":now": new Date().toISOString(),
        ":et": "USER",
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return (res.Attributes?.totalPoints as number) ?? 0;
}

export async function addTicket(userId: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { userId },
      UpdateExpression:
        "ADD ticketCount :one SET updatedAt = :now, entityType = :et",
      ExpressionAttributeValues: {
        ":one": 1,
        ":now": new Date().toISOString(),
        ":et": "USER",
      },
    })
  );
}

export async function getLeaderboard(limit = 20): Promise<User[]> {
  // Previously: on a GSI failure this fell back to a full table Scan, and on a
  // Scan failure it returned four hardcoded fake users with invented point
  // totals from a public endpoint. Both fallbacks are gone — a query failure
  // must surface as an error, not as fabricated leaderboard standings.
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.USERS,
      IndexName: "leaderboard-index",
      KeyConditionExpression: "entityType = :et",
      ExpressionAttributeValues: { ":et": "USER" },
      ScanIndexForward: false,
      Limit: limit,
      // Least privilege at the storage layer; lib/api/dto.ts is the boundary.
      ProjectionExpression: "userId, displayName, lineImage, totalPoints",
    })
  );
  return (res.Items ?? []) as User[];
}

export async function listUsers(): Promise<User[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.USERS }));
  return (res.Items ?? []) as User[];
}

export async function setAdmin(userId: string, isAdmin: boolean): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { userId },
      UpdateExpression: "SET isAdmin = :a",
      ExpressionAttributeValues: { ":a": isAdmin },
    })
  );
}

export async function addInventoryItem(userId: string, item: InventoryItem): Promise<void> {
  const existing = await getUser(userId);
  const currentInventory = existing?.inventory || [];
  const updatedInventory = [...currentInventory, item];

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { userId },
      UpdateExpression: "SET inventory = :inv, updatedAt = :now",
      ExpressionAttributeValues: {
        ":inv": updatedInventory,
        ":now": new Date().toISOString(),
      },
    })
  );
}
