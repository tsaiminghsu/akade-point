import { NextResponse } from "next/server";

import { requireAdminOrDevBypass } from "@/lib/session";
import { listClawConfigs } from "@/lib/dynamo/cc-claw-configs";

/** Every saved config. Machines missing from the list run factory defaults. */
export async function GET() {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ configs: await listClawConfigs() });
}
