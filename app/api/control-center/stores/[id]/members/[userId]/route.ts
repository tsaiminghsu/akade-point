import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAccessAt } from "@/lib/access-server";
import { canAssignStoreRole, cleanStoreRoles, effectiveRole, STORE_ROLES } from "@/lib/control-center/access";
import { getRole, setStoreRole } from "@/lib/dynamo/cc-roles";
import { getStore } from "@/lib/dynamo/cc-stores";
import { getUser } from "@/lib/dynamo/users";

const bodySchema = z.object({ role: z.enum(STORE_ROLES).nullable() });

/**
 * Sets or removes a user's role at this store. Store admins may do it for
 * people below them there and up to their own role (canAssignStoreRole);
 * only this store's entry changes, never the global role or other stores.
 */
export async function PUT(req: Request, { params }: { params: { id: string; userId: string } }) {
  const actor = await requireAccessAt("store.members", params.id);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (params.userId === actor.id) return NextResponse.json({ error: "You cannot change your own role", code: "SELF" }, { status: 400 });
  if (!(await getStore(params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [profile, rec] = await Promise.all([getUser(params.userId), getRole(params.userId)]);
  if (!profile && process.env.NODE_ENV === "production") return NextResponse.json({ error: "No such user", code: "USER" }, { status: 404 });
  const target = { role: effectiveRole(rec?.role, profile?.isAdmin), stores: cleanStoreRoles(rec?.stores) };
  if (!canAssignStoreRole(actor, target, params.id, body.data.role)) {
    return NextResponse.json({ error: "Not allowed for this person or role", code: "RANK" }, { status: 403 });
  }

  await setStoreRole(params.userId, params.id, body.data.role, actor.id);
  return NextResponse.json({ userId: params.userId, storeId: params.id, role: body.data.role });
}
