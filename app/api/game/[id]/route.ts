import { NextResponse } from "next/server";
import { getGameSession } from "@/lib/dynamo/sessions";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getGameSession(params.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.userId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Never expose serverSeed until COMPLETED
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { serverSeed: _s, ...safe } = session;
  return NextResponse.json(safe);
}
