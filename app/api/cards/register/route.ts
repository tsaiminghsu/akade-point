import { NextResponse } from "next/server";
import { z } from "zod";
import { getCardByToken, markCardRegistered } from "@/lib/dynamo/cards";
import { createRegistration, isTokenRegistered } from "@/lib/dynamo/registrations";
import { getShop } from "@/lib/dynamo/shops";
import { addPoints, addTicket } from "@/lib/dynamo/users";
import { getCollectionStatus } from "@/lib/collection";
import { requireSession } from "@/lib/session";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

const schema = z.object({
  qrToken: z.string().min(1),
  shopCode: z.string().min(1),
  choice: z.enum(["POINTS", "TICKET"]),
});

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { qrToken, shopCode, choice } = body.data;

  const [card, shop, alreadyRegistered] = await Promise.all([
    getCardByToken(qrToken),
    getShop(shopCode),
    isTokenRegistered(qrToken),
  ]);

  if (!card) return NextResponse.json({ error: "卡片不存在" }, { status: 404 });
  if (!shop || !shop.isActive)
    return NextResponse.json({ error: "店家代碼無效" }, { status: 400 });
  if (alreadyRegistered)
    return NextResponse.json({ error: "此卡片已被登錄" }, { status: 409 });

  try {
    await markCardRegistered(qrToken, user.id);
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException)
      return NextResponse.json({ error: "此卡片已被登錄" }, { status: 409 });
    throw e;
  }

  const pointsAwarded = choice === "POINTS" ? card.basePoints : 0;

  const [registration] = await Promise.all([
    createRegistration({
      userId: user.id,
      qrToken,
      cardNumber: card.cardNumber,
      rarity: card.rarity,
      nameZh: card.nameZh,
      shopCode,
      shopName: shop.name,
      choice,
      pointsAwarded,
      registeredAt: new Date().toISOString(),
    }),
    choice === "POINTS"
      ? addPoints(user.id, card.basePoints)
      : addTicket(user.id),
  ]);

  const collectionStatus = await getCollectionStatus(user.id);

  return NextResponse.json({
    registration,
    card: { cardNumber: card.cardNumber, nameZh: card.nameZh, rarity: card.rarity, basePoints: card.basePoints },
    pointsAwarded,
    collectionStatus,
    newRewardsUnlocked: collectionStatus.eligibleTiers,
  });
}
