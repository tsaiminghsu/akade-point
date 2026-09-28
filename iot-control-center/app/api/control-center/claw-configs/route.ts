import { NextResponse } from "next/server";

import { requireAnyAccess, storeFilter } from "@/lib/access-server";
import { listClawConfigs } from "@/lib/dynamo/cc-claw-configs";
import { listMachines } from "@/lib/dynamo/cc-machines";

/** Every saved config. Machines missing from the list run factory defaults. */
export async function GET() {
  const actor = await requireAnyAccess("read");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [configs, machines] = await Promise.all([listClawConfigs(), listMachines()]);
  const allowed = storeFilter(actor, "read");
  const storeOf = new Map(machines.map((m) => [m.id, m.storeId]));
  return NextResponse.json({ configs: configs.filter((c) => allowed(storeOf.get(c.machineId))) });
}
