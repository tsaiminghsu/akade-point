import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAccessAt } from "@/lib/access-server";
import { findUserByEmail, getUser } from "@/lib/dynamo/users";

const bodySchema = z.object({ query: z.string().trim().min(3).max(200) });

/**
 * Finds one account by exact e-mail or user id, so a store admin can add a
 * person they know without browsing every account (the full list stays with
 * system-admins). The person must have signed in once (LINE) to exist.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAccessAt("store.members", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const q = body.data.query;
  const user = q.includes("@") ? await findUserByEmail(q) : await getUser(q);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user: { userId: user.userId, name: user.displayName ?? null, email: user.email ?? null } });
}
