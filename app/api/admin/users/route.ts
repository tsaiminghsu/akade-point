import { NextResponse } from "next/server";
import { listUsers, setAdmin } from "@/lib/dynamo/users";
import { requireSession } from "@/lib/session";
import { getUser } from "@/lib/dynamo/users";
import { z } from "zod";

async function requireAdmin() {
  const authUser = await requireSession();
  if (!authUser) return null;
  const profile = await getUser(authUser.id);
  return profile?.isAdmin ? authUser : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const users = await listUsers();
  return NextResponse.json({ users });
}

const patchSchema = z.object({ userId: z.string(), isAdmin: z.boolean() });

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await setAdmin(body.data.userId, body.data.isAdmin);
  return NextResponse.json({ ok: true });
}
