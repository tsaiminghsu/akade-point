import { NextResponse } from "next/server";
import { listUsers, getUser } from "@/lib/dynamo/users";
import { listCards } from "@/lib/dynamo/cards";
import { requireSession } from "@/lib/session";

export async function GET() {
  const authUser = await requireSession();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getUser(authUser.id);
  if (!profile?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [users, cards] = await Promise.all([listUsers(), listCards()]);

  const registeredCards = cards.filter((c) => c.isRegistered).length;
  const totalPoints = users.reduce((sum, u) => sum + (u.totalPoints ?? 0), 0);
  const byRarity = { N: 0, R: 0, SR: 0 };
  for (const c of cards) {
    if (c.isRegistered && c.rarity in byRarity)
      byRarity[c.rarity as keyof typeof byRarity]++;
  }

  return NextResponse.json({
    totalUsers: users.length,
    totalCards: cards.length,
    registeredCards,
    unregisteredCards: cards.length - registeredCards,
    totalPointsDistributed: totalPoints,
    cardsByRarity: byRarity,
  });
}
