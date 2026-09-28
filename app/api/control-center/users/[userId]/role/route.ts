import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAccess } from "@/lib/access-server";
import { ROLES } from "@/lib/control-center/access";
import { clearRole, setRole } from "@/lib/dynamo/cc-roles";
import { getUser } from "@/lib/dynamo/users";

const bodySchema = z.object({
  /** null removes the explicit role (falls back to akade-users.isAdmin) */
  role: z.enum(ROLES).nullable(),
});

/** Assigns a Control Center role (system-admin only). */
export async function PUT(req: Request, { params }: { params: { userId: string } }) {
  const actor = await requireAccess("users.manage");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Nobody demotes themselves: the last system-admin could lock everyone out.
  if (params.userId === actor.id && body.data.role !== "system-admin") {
    return NextResponse.json({ error: "You cannot change your own role", code: "SELF" }, { status: 400 });
  }
  if (!(await getUser(params.userId)) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.data.role === null) {
    await clearRole(params.userId);
    return NextResponse.json({ userId: params.userId, role: null });
  }
  const rec = await setRole(params.userId, body.data.role, actor.id);
  return NextResponse.json(rec);
}
