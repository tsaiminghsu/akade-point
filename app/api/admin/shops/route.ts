import { NextResponse } from "next/server";
import { z } from "zod";
import { listShops, createShop } from "@/lib/dynamo/shops";
import { requireSession } from "@/lib/session";
import { getUser } from "@/lib/dynamo/users";

const schema = z.object({
  shopCode: z.string().min(1),
  name: z.string().min(1),
  location: z.string().optional(),
});

async function requireAdmin() {
  const authUser = await requireSession();
  if (!authUser) return null;
  const profile = await getUser(authUser.id);
  if (!profile?.isAdmin) return null;
  return authUser;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const shops = await listShops();
  return NextResponse.json({ shops });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const shop = await createShop(body.data.shopCode, body.data.name, body.data.location);
  return NextResponse.json({ shop });
}
