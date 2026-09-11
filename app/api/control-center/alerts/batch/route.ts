import { NextResponse } from "next/server";

import { requireAdminOrDevBypass } from "@/lib/session";
import { createAlerts } from "@/lib/dynamo/cc-alerts";
import { alertBatchSchema } from "../schema";

/** Bulk-writes alerts detected in one simulation tick. Returns the created
 *  records in input order so the client can replace its draft ids. */
export async function POST(req: Request) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const body = alertBatchSchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const alerts = await createAlerts(body.data.alerts);
  return NextResponse.json({ alerts });
}
