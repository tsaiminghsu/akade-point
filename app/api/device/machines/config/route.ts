import { NextResponse } from "next/server";

import { requireMachineToken } from "@/lib/machine-auth";
import { getMachine } from "@/lib/dynamo/cc-machines";
import { getClawConfig } from "@/lib/dynamo/cc-claw-configs";
import { getClawSync, recordPull } from "@/lib/dynamo/cc-claw-sync";
import { factoryConfig } from "@/lib/control-center/claw/config";
import {
  cleanFirmware,
  etagFor,
  matchesEtag,
  shouldRecordPull,
  toDevicePayload,
} from "@/lib/control-center/claw/device";

export const dynamic = "force-dynamic";

/**
 * A claw machine's board pulls its settings. Send If-None-Match with the last
 * sha you processed: 304 means nothing new. The optional X-Firmware header is
 * shown on the setup page.
 */
export async function GET(req: Request) {
  const auth = await requireMachineToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const machineId = auth.machineId;
  const [machine, saved, sync] = await Promise.all([
    getMachine(machineId),
    getClawConfig(machineId),
    getClawSync(machineId),
  ]);
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const payload = toDevicePayload(saved ?? factoryConfig(machineId));
  const fw = cleanFirmware(req.headers.get("x-firmware"));
  const now = Date.now();
  if (shouldRecordPull(sync, payload.sha, fw, now)) {
    // Bookkeeping only: the board still gets its config if this write fails.
    await recordPull(machineId, { sha: payload.sha, rev: payload.rev, fw, now }).catch((err) =>
      console.error("claw sync pull write failed", err)
    );
  }

  const headers = { ETag: etagFor(payload.sha), "Cache-Control": "no-store" };
  if (matchesEtag(req.headers.get("if-none-match"), payload.sha)) {
    return new Response(null, { status: 304, headers });
  }
  return NextResponse.json(payload, { headers });
}
