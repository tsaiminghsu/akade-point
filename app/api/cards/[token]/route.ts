import { NextResponse } from "next/server";
import { getCardByToken } from "@/lib/dynamo/cards";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const card = await getCardByToken(params.token);
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  // Don't expose registration details (registeredBy) to the client
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { registeredBy: _rb, ...safe } = card;
  return NextResponse.json(safe);
}
