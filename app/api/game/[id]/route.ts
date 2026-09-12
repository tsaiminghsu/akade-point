import { NextResponse } from "next/server";
import { getGameSession, toPublicSession } from "@/lib/dynamo/sessions";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = await getGameSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.userId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // serverSeed is stripped centrally; see toPublicSession in lib/dynamo/sessions.
  const safe = toPublicSession(session);
  return NextResponse.json(safe);
}
