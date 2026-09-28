import { NextResponse } from "next/server";
import { z } from "zod";
import { canAt, requireAccessAt } from "@/lib/access-server";
import { deleteMachine, getMachine, updateMachine } from "@/lib/dynamo/cc-machines";
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
  const machine = await getMachine(params.id);
  const actor = await requireAccessAt("store.manage", machine?.storeId);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!machine) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // Moving it to another store needs the right there too.
  if (body.data.storeId && !canAt(actor, "store.manage", body.data.storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await updateMachine(params.id, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const machine = await getMachine(params.id);
  if (!(await requireAccessAt("store.manage", machine?.storeId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Dependents first; the machine row goes last.
  await revokeAllForMachine(params.id);
  await Promise.all([deleteClawConfig(params.id), deleteClawSync(params.id)]);
  await deleteMachine(params.id);
  return NextResponse.json({ ok: true });
}
