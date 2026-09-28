import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAccess } from "@/lib/access-server";
import { ROLES, STORE_ROLES } from "@/lib/control-center/access";
import { getRole, setGrants } from "@/lib/dynamo/cc-roles";
import { getStore } from "@/lib/dynamo/cc-stores";
import { getUser } from "@/lib/dynamo/users";

const bodySchema = z
  .object({
    /** global role; null removes it (falls back to akade-users.isAdmin); omitted keeps it */
    role: z.enum(ROLES).nullable().optional(),
    /** the complete set of per-store roles; omitted keeps them */
    stores: z.record(z.string().min(1).max(64), z.enum(STORE_ROLES)).optional(),
  })
  .refine((b) => b.role !== undefined || b.stores !== undefined, { message: "role or stores required" });

/** Assigns a user's global role and/or per-store roles (system-admin only). */
export async function PUT(req: Request, { params }: { params: { userId: string } }) {
  const actor = await requireAccess("users.manage");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Nobody changes their own grants: the last system-admin could lock everyone out.
  if (params.userId === actor.id) {
    return NextResponse.json({ error: "You cannot change your own role", code: "SELF" }, { status: 400 });
  }
  if (!(await getUser(params.userId)) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stores = body.data.stores;
  if (stores) {
    const found = await Promise.all(Object.keys(stores).map((id) => getStore(id)));
    const unknown = Object.keys(stores).filter((_, i) => !found[i]);
    if (unknown.length) return NextResponse.json({ error: "Unknown store", code: "STORE", stores: unknown }, { status: 400 });
  }

  const prev = await getRole(params.userId);
  const rec = await setGrants(
    params.userId,
    {
      role: body.data.role === undefined ? (prev?.role ?? null) : body.data.role,
      stores: stores ?? prev?.stores ?? {},
    },
    actor.id
  );
  return NextResponse.json({ userId: params.userId, role: rec?.role ?? null, stores: rec?.stores ?? {} });
}
