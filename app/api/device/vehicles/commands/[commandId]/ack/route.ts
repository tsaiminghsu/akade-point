import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { applyAckUpdate, getCommand } from "@/lib/dynamo/cc-vehicle-commands";
import { ackPostSchema } from "@/lib/control-center/vehicles/schemas";
import { applyAck } from "@/lib/control-center/vehicles/commandState";

export async function POST(req: Request, { params }: { params: { commandId: string } }) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = ackPostSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const command = await getCommand(params.commandId);
  // A companion may only ack its own vehicle's commands.
  if (!command || command.vehicleId !== auth.vehicleId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = applyAck(command, body.data);
  if (!updated) return NextResponse.json({ error: "Command already settled" }, { status: 409 });

  const ok = await applyAckUpdate(command.id, {
    status: updated.status,
    code: updated.code,
    msg: updated.msg,
    result: updated.result,
    ackedAt: updated.ackedAt ?? Date.now(),
    late: updated.late,
  });
  if (!ok) return NextResponse.json({ error: "Command already settled" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
