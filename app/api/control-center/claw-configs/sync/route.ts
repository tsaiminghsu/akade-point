import { NextResponse } from "next/server";

import { requireAccess } from "@/lib/access-server";
import { listClawSync } from "@/lib/dynamo/cc-claw-sync";
import { boardBrokerUri, clawNotifyMode } from "@/lib/iot/claw-notify";

export const dynamic = "force-dynamic";

/**
 * What each machine's board last pulled and applied (machines whose board
 * never connected are absent), and how this server rings boards on a save.
 */
export async function GET() {
  if (!(await requireAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    sync: await listClawSync(),
    notify: { mode: clawNotifyMode(), brokerUri: boardBrokerUri() },
  });
}
