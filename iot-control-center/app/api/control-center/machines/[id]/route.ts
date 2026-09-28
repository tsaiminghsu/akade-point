import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-server";
import { deleteMachine, updateMachine } from "@/lib/dynamo/cc-machines";
import { deleteClawConfig } from "@/lib/dynamo/cc-claw-configs";
import { deleteClawSync } from "@/lib/dynamo/cc-claw-sync";
import { revokeAllForMachine } from "@/lib/dynamo/cc-machine-tokens";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  storeId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  status: z.enum(["online", "warning", "alarm", "offline"]).optional(),
  current: z.number().optional(),
  door: z.enum(["closed", "open"]).optional(),
  doorOpenSince: z.number().nullable().optional(),
  heartbeatAt: z.number().optional(),
  rssi: z.number().optional(),
  firmware: z.string().optional(),
  restartCount: z.number().optional(),
  lastUpdate: z.number().optional(),
  currentHistory: z.array(z.object({ t: z.number(), value: z.number() })).optional(),
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
  await updateMachine(params.id, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Dependents first; the machine row goes last.
  await revokeAllForMachine(params.id);
  await Promise.all([deleteClawConfig(params.id), deleteClawSync(params.id)]);
  await deleteMachine(params.id);
  return NextResponse.json({ ok: true });
}
