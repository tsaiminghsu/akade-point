import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrDevBypass } from "@/lib/session";
import { updateAlertStatus } from "@/lib/dynamo/cc-alerts";

const patchSchema = z.object({
  status: z.enum(["active", "acknowledged", "resolved", "ignored"]),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateAlertStatus(params.id, body.data.status);
  return NextResponse.json({ ok: true });
}
