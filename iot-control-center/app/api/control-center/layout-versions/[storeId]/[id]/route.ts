import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-server";
import { deleteVersion, renameVersion, updateVersionWidgets } from "@/lib/dynamo/cc-layout-versions";
import type { Widget } from "@/lib/control-center/types";

const MAX_PAYLOAD_BYTES = 350_000;

const widgetSchema = z.record(z.string(), z.unknown());

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    widgets: z.array(widgetSchema).optional(),
  })
  .refine((data) => data.name !== undefined || data.widgets !== undefined, {
    message: "At least one of name or widgets is required",
  });

export async function PATCH(req: Request, { params }: { params: { storeId: string; id: string } }) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (body.data.widgets) {
    await updateVersionWidgets(params.storeId, params.id, body.data.widgets as unknown as Widget[]);
  }
  if (body.data.name) {
    await renameVersion(params.storeId, params.id, body.data.name);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { storeId: string; id: string } }) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ok = await deleteVersion(params.storeId, params.id);
  if (!ok) return NextResponse.json({ error: "Cannot delete the only saved layout version for this store" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
