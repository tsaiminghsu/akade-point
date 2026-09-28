import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-server";
import { deleteStore, updateStore } from "@/lib/dynamo/cc-stores";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  brandId: z.string().min(1).optional(),
  activeLayoutVersionId: z.string().nullable().optional(),
})
  // Every field is optional, so guard against `{}`: an empty patch would
  // otherwise reach DynamoDB as an empty SET expression and fail with a 500.
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateStore(params.id, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ok = await deleteStore(params.id);
  if (!ok) return NextResponse.json({ error: "Store still has machines assigned to it" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
