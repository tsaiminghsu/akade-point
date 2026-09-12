import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./client";
import { createId } from "@paralleldrive/cuid2";

import { BASE_REWARDS, type GameTrigger } from "@/lib/game/award";

export type { GameTrigger };
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

// Defined in lib/game/award.ts so client pages can read it without pulling
// the AWS SDK into the browser bundle.
export { BASE_REWARDS };

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

/**
 * A game session with the provably-fair commitment secret removed.
 *
 * serverSeed must not reach a client before the round is settled: clientSeed
 * is client-chosen and nonce is 0, so anyone holding the seed can compute the
 * resulting board for any clientSeed offline and pick the most favourable one
 * before calling /start. Only /api/game/[id]/verify may reveal it, and only
 * once the session is COMPLETED.
 */
export type PublicGameSession = Omit<GameSession, "serverSeed">;

export function toPublicSession(session: GameSession): PublicGameSession {
  // Destructure rather than delete so a newly added secret field is a type error.
  const { serverSeed: _serverSeed, ...rest } = session;
  void _serverSeed;
  return rest;
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
