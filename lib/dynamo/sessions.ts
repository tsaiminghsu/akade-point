import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./client";
import { createId } from "@paralleldrive/cuid2";

export type GameTrigger = "SMALL_GIFT" | "MEDIUM_GIFT" | "LARGE_GIFT" | "SSR_COMPLETE";
export type GameStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "EXPIRED";

export interface GameSession {
  sessionId: string;
  userId: string;
  trigger: GameTrigger;
  baseReward: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed?: string;
  nonce: number;
  finalSeed?: string;
  initialGrid?: string;
  finalGrid?: string;
  status: GameStatus;
  combos?: number;
  multiplier?: number;
  bonusPoints?: number;
  totalPoints?: number;
  tier: string;
  createdAt: string;
  completedAt?: string;
}

export const BASE_REWARDS: Record<GameTrigger, number> = {
  SMALL_GIFT: 5,
  MEDIUM_GIFT: 15,
  LARGE_GIFT: 40,
  SSR_COMPLETE: 100,
};

export async function createGameSession(
  data: Pick<GameSession, "userId" | "trigger" | "tier" | "serverSeed" | "serverSeedHash">
): Promise<GameSession> {
  const session: GameSession = {
    sessionId: createId(),
    ...data,
    baseReward: BASE_REWARDS[data.trigger],
    nonce: 0,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLES.SESSIONS, Item: session }));
  return session;
}

export async function getGameSession(sessionId: string): Promise<GameSession | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLES.SESSIONS, Key: { sessionId } })
  );
  return (res.Item as GameSession) ?? null;
}

export async function startGameSession(
  sessionId: string,
  clientSeed: string,
  finalSeed: string,
  initialGrid: string
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.SESSIONS,
      Key: { sessionId },
      UpdateExpression:
        "SET clientSeed = :cs, finalSeed = :fs, initialGrid = :ig, #st = :active",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":cs": clientSeed,
        ":fs": finalSeed,
        ":ig": initialGrid,
        ":active": "ACTIVE",
        ":pending": "PENDING",
      },
      ConditionExpression: "#st = :pending",
    })
  );
}

export async function completeGameSession(
  sessionId: string,
  data: {
    finalGrid: string;
    combos: number;
    multiplier: number;
    bonusPoints: number;
    totalPoints: number;
  }
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.SESSIONS,
      Key: { sessionId },
      UpdateExpression:
        "SET finalGrid = :fg, combos = :c, multiplier = :m, bonusPoints = :bp, totalPoints = :tp, #st = :done, completedAt = :now",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":fg": data.finalGrid,
        ":c": data.combos,
        ":m": data.multiplier,
        ":bp": data.bonusPoints,
        ":tp": data.totalPoints,
        ":done": "COMPLETED",
        ":now": new Date().toISOString(),
        ":active": "ACTIVE",
      },
      ConditionExpression: "#st = :active",
    })
  );
}

export async function getUserSessions(userId: string): Promise<GameSession[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.SESSIONS,
      IndexName: "user-sessions-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ScanIndexForward: false,
    })
  );
  return (res.Items ?? []) as GameSession[];
}
