import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/dynamo/users";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const leaders = await getLeaderboard(limit);
  return NextResponse.json({ leaders });
}
