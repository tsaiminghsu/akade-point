import { NextResponse } from "next/server";
import { listCards } from "@/lib/dynamo/cards";
import { requireSession } from "@/lib/session";
import { getUser } from "@/lib/dynamo/users";

export async function GET(req: Request) {
  const authUser = await requireSession();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getUser(authUser.id);
  if (!profile?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter");
  const cards = await listCards(
    filter === "registered" ? true : filter === "unregistered" ? false : undefined
  );
  return NextResponse.json({ cards });
}
