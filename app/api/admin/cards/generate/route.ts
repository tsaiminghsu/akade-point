import { NextResponse } from "next/server";
import { z } from "zod";
import { batchCreateCards, CARD_TYPES } from "@/lib/dynamo/cards";
import { requireSession } from "@/lib/session";
import { getUser } from "@/lib/dynamo/users";

const schema = z.object({
  cardNumber: z.enum(["001", "002", "003", "004", "005"]),
  quantity: z.number().int().min(1).max(500),
  printBatch: z.string().min(1),
});

export async function POST(req: Request) {
  const authUser = await requireSession();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getUser(authUser.id);
  if (!profile?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = schema.safeParse(await req.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { cardNumber, quantity, printBatch } = body.data;
  const cards = await batchCreateCards(cardNumber, quantity, printBatch);
  return NextResponse.json({ count: cards.length, cards });
}

export async function GET() {
  const authUser = await requireSession();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getUser(authUser.id);
  if (!profile?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ cardTypes: CARD_TYPES });
}
