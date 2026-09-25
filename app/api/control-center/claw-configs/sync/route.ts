import { NextResponse } from "next/server";

import { requireAdminOrDevBypass } from "@/lib/session";
import { listClawSync } from "@/lib/dynamo/cc-claw-sync";

export const dynamic = "force-dynamic";

/** What each machine's board last pulled and applied. Machines whose board never connected are absent. */
export async function GET() {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ sync: await listClawSync() });
}
