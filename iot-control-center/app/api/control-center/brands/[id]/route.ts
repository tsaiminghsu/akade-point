import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrDevBypass } from "@/lib/session";
import { deleteBrand, updateBrand } from "@/lib/dynamo/cc-brands";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().min(1).optional(),
})
  // Every field is optional, so guard against `{}`: an empty patch would
  // otherwise reach DynamoDB as an empty SET expression and fail with a 500.
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateBrand(params.id, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ok = await deleteBrand(params.id);
  if (!ok) return NextResponse.json({ error: "Brand still has stores assigned to it" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
