import { NextResponse } from "next/server";
import { z } from "zod";
import { getCollectionStatus } from "@/lib/collection";
import { claimReward } from "@/lib/dynamo/rewards";
import { createGameSession } from "@/lib/dynamo/sessions";
import { createCommitment } from "@/lib/game/provably-fair";
import { requireSession } from "@/lib/session";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { RewardTier } from "@/lib/dynamo/rewards";
import type { GameTrigger } from "@/lib/dynamo/sessions";

const TIER_TO_TRIGGER: Record<RewardTier, GameTrigger> = {
  SMALL: "SMALL_GIFT",
  MEDIUM: "MEDIUM_GIFT",
  LARGE: "LARGE_GIFT",
  SSR_COMPLETE: "SSR_COMPLETE",
};

const schema = z.object({
  tier: z.enum(["SMALL", "MEDIUM", "LARGE", "SSR_COMPLETE"]),
});

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { tier } = body.data;
  const status = await getCollectionStatus(user.id);

  if (!status.eligibleTiers.includes(tier))
    return NextResponse.json({ error: "此獎勵尚未達成條件" }, { status: 400 });

  const { serverSeed, serverSeedHash } = createCommitment();
  const session = await createGameSession({
    userId: user.id,
    trigger: TIER_TO_TRIGGER[tier],
    tier,
    serverSeed,
    serverSeedHash,
  });

  try {
    await claimReward(user.id, tier, session.sessionId);
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException)
      return NextResponse.json({ error: "此獎勵已領取" }, { status: 409 });
    throw e;
  }

  return NextResponse.json({
    gameSession: {
      sessionId: session.sessionId,
      serverSeedHash: session.serverSeedHash,
      trigger: session.trigger,
      baseReward: session.baseReward,
      status: session.status,
    },
  });
}
