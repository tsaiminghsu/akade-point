import { NextResponse } from "next/server";

import { requireAccess } from "@/lib/access-server";
import { listClawConfigs } from "@/lib/dynamo/cc-claw-configs";

/** Every saved config. Machines missing from the list run factory defaults. */
export async function GET() {
  if (!(await requireAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ configs: await listClawConfigs() });
}
