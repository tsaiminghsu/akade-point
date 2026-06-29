import { NextResponse } from "next/server";
import { z } from "zod";
import { getGameSession, completeGameSession } from "@/lib/dynamo/sessions";
import { addPoints, addInventoryItem } from "@/lib/dynamo/users";
import { drawBlindBoxItem } from "@/lib/game/blind-box-pool";
import { isPermutation, type OrbColor } from "@/lib/game/orb-generator";
import { detectCombos } from "@/lib/game/combo-detector";
import { calculateMultiplier } from "@/lib/game/multiplier";
import { requireSession } from "@/lib/session";

const ORB_VALUES = ["FIRE", "WATER", "WOOD", "LIGHT", "DARK", "RECOVERY"] as const;
const schema = z.object({
  finalGrid: z.array(z.enum(ORB_VALUES)).length(30),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getGameSession(params.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.userId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.status !== "ACTIVE")
    return NextResponse.json({ error: "Game not active" }, { status: 400 });

  // Time limit: reject if more than 90s since creation
  const elapsed = Date.now() - new Date(session.createdAt).getTime();
  if (elapsed > 90_000)
    return NextResponse.json({ error: "時間已到" }, { status: 400 });

  const body = schema.safeParse(await req.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid grid" }, { status: 400 });

  const { finalGrid } = body.data;
  const initialGrid = JSON.parse(session.initialGrid!) as OrbColor[];

  // Validate permutation
  if (!isPermutation(initialGrid, finalGrid as OrbColor[]))
    return NextResponse.json({ error: "Invalid grid state" }, { status: 400 });

  const combos = detectCombos(finalGrid as OrbColor[]);
  const multiplier = calculateMultiplier(combos);
  const rawTotal = Math.round(session.baseReward * multiplier);
  
  const MAX_BONUS_LIMIT = 200; // 單局最高派發額外點數上限
  let bonusPoints = rawTotal - session.baseReward;
  if (bonusPoints > MAX_BONUS_LIMIT) {
    bonusPoints = MAX_BONUS_LIMIT;
  }
  const totalPoints = session.baseReward + bonusPoints;

  const claimedItem = drawBlindBoxItem(combos);

  await Promise.all([
    completeGameSession(params.id, {
      finalGrid: JSON.stringify(finalGrid),
      combos,
      multiplier,
      bonusPoints,
      totalPoints,
    }),
    addPoints(user.id, totalPoints),
    addInventoryItem(user.id, {
      itemId: `box_item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: claimedItem.name,
      rarity: claimedItem.rarity,
      desc: claimedItem.desc,
      claimedAt: new Date().toISOString(),
    }),
  ]);

  return NextResponse.json({
    combos,
    multiplier,
    bonusPoints,
    totalPoints,
    baseReward: session.baseReward,
    trigger: session.trigger,
    ssrCardGranted: session.trigger === "SSR_COMPLETE",
    claimedItem,
  });
}
