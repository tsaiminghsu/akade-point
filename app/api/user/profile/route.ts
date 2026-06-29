import { NextResponse } from "next/server";
import { getUser } from "@/lib/dynamo/users";
import { getUserSessions } from "@/lib/dynamo/sessions";
import { requireSession } from "@/lib/session";

export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, sessions] = await Promise.all([
    getUser(user.id),
    getUserSessions(user.id),
  ]);

  return NextResponse.json({ profile, sessions: sessions.slice(0, 10) });
}
