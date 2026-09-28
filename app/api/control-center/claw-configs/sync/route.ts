import { NextResponse } from "next/server";

import { requireAnyAccess, storeFilter } from "@/lib/access-server";
import { listClawSync } from "@/lib/dynamo/cc-claw-sync";
import { listMachines } from "@/lib/dynamo/cc-machines";
import { boardBrokerUri, clawNotifyMode } from "@/lib/iot/claw-notify";

export const dynamic = "force-dynamic";

/**
 * What each machine's board last pulled and applied (machines whose board
 * never connected are absent), and how this server rings boards on a save.
 */
export async function GET() {
  const actor = await requireAnyAccess("read");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [sync, machines] = await Promise.all([listClawSync(), listMachines()]);
  const allowed = storeFilter(actor, "read");
  const storeOf = new Map(machines.map((m) => [m.id, m.storeId]));
  return NextResponse.json({
    sync: sync.filter((s) => allowed(storeOf.get(s.machineId))),
    notify: { mode: clawNotifyMode(), brokerUri: boardBrokerUri() },
  });
}
