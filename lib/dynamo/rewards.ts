import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./client";

export type RewardTier = "SMALL" | "MEDIUM" | "LARGE" | "SSR_COMPLETE";

export interface ClaimedReward {
  userId: string;
  tier: RewardTier;
  claimedAt: string;
  gameSessionId: string;
}

export async function claimReward(
  userId: string,
  tier: RewardTier,
  gameSessionId: string
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLES.REWARDS,
      Item: {
        userId,
        tier,
        claimedAt: new Date().toISOString(),
        gameSessionId,
      },
      // Prevent double-claim: only succeed if this tier hasn't been claimed yet
      ConditionExpression:
        "attribute_not_exists(userId) AND attribute_not_exists(tier)",
    })
  );
}

export async function getUserRewards(userId: string): Promise<ClaimedReward[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.REWARDS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    })
  );
  return (res.Items ?? []) as ClaimedReward[];
}
