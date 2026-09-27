import { NextResponse } from "next/server";

import { requireMachineToken } from "@/lib/machine-auth";
import { getMachine } from "@/lib/dynamo/cc-machines";
import { getClawSync, recordAck } from "@/lib/dynamo/cc-claw-sync";
import { createEvent } from "@/lib/dynamo/cc-machine-events";
import { cleanFirmware, type ClawAck } from "@/lib/control-center/claw/device";
import { deviceAckSchema } from "@/lib/control-center/claw/schemas";

/**
 * The board reports whether it applied the config it pulled. Each new outcome
 * goes on the machine's event log once; a board repeating the same report (a
 * retry after a lost response) is stored but not logged again.
 */
export async function POST(req: Request) {
  const auth = await requireMachineToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = deviceAckSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const machineId = auth.machineId;
  const [machine, prev] = await Promise.all([getMachine(machineId), getClawSync(machineId)]);
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const ack: ClawAck = {
    st: body.data.st,
    sha: body.data.sha,
    rev: body.data.rev,
    code: body.data.code ?? (body.data.st === "applied" ? "OK" : "FAILED"),
    msg: body.data.msg ?? "",
    t: Date.now(),
  };
  await recordAck(machineId, ack, cleanFirmware(req.headers.get("x-firmware")));

  const repeat =
    ack.st === "applied"
      ? prev?.appliedSha === ack.sha
      : prev?.lastAck?.st === "failed" && prev.lastAck.sha === ack.sha && prev.lastAck.code === ack.code;
  if (!repeat) {
    const detail = ack.msg ? `${ack.code} ${ack.msg}` : ack.code;
    await createEvent({
      machineId,
      storeId: machine.storeId,
      type: ack.st === "applied" ? "config_applied" : "config_apply_failed",
      message:
        ack.st === "applied"
          ? `${machine.name} 主機板已套用娃娃機設定（第 ${ack.rev} 版）`
          : `${machine.name} 主機板套用娃娃機設定失敗（第 ${ack.rev} 版）：${detail}`,
      severity: ack.st === "applied" ? "info" : "warning",
      timestamp: ack.t,
    }).catch((err) => console.error("claw ack event write failed", err));
  }
  return NextResponse.json({ ok: true });
}
