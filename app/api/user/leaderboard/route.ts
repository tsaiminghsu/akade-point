import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/dynamo/users";
import { requireSession } from "@/lib/session";
import { toLeaderboardEntry } from "@/lib/api/dto";

export async function GET(req: Request) {
  // Was unauthenticated. The leaderboard-index GSI projects ALL attributes, so
  // this endpoint returned every top user's email, isAdmin flag, inventory and
  // questionnaire answers to anonymous callers.
  const user = await requireSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // parseInt("abc") is NaN, and Math.min(NaN, 50) is NaN, which was passed
  // straight to DynamoDB as `Limit`.
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 50) : 20;

  const leaders = await getLeaderboard(limit);
  return NextResponse.json({ leaders: leaders.map(toLeaderboardEntry) });
}
