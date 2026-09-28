import { NextResponse } from "next/server";
import { z } from "zod";
import { canAt, requireAccessAt } from "@/lib/access-server";
import { deleteGroup, getGroup, updateGroup } from "@/lib/dynamo/cc-groups";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  storeId: z.string().min(1).optional(),
})
  // Every field is optional, so guard against `{}`: an empty patch would
  // otherwise reach DynamoDB as an empty SET expression and fail with a 500.
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const group = await getGroup(params.id);
  const actor = await requireAccessAt("store.manage", group?.storeId);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (body.data.storeId && !canAt(actor, "store.manage", body.data.storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await updateGroup(params.id, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const group = await getGroup(params.id);
  if (!(await requireAccessAt("store.manage", group?.storeId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ok = await deleteGroup(params.id);
  if (!ok) return NextResponse.json({ error: "Group still has machines assigned to it" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
