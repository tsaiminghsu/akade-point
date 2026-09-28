import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccessAt } from "@/lib/access-server";
import { getAlert, updateAlertStatus } from "@/lib/dynamo/cc-alerts";

const patchSchema = z.object({
  status: z.enum(["active", "acknowledged", "resolved", "ignored"]),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const alert = await getAlert(params.id);
  if (!(await requireAccessAt("alert.handle", alert?.storeId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateAlertStatus(params.id, body.data.status);
  return NextResponse.json({ ok: true });
}
