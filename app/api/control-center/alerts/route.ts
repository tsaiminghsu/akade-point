import { NextResponse } from "next/server";

import { requireAdminOrDevBypass } from "@/lib/session";
import { createAlert, listAlertsByMachine, listAlertsByStore, listRecentAlerts } from "@/lib/dynamo/cc-alerts";
import { recentQuerySchema } from "../events/schema";
import { alertCreateSchema } from "./schema";

export async function GET(req: Request) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const query = recentQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!query.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { limit, before, storeId, machineId } = query.data;
  const opts = { limit, before };
  const alerts = machineId
    ? await listAlertsByMachine(machineId, opts)
    : storeId
      ? await listAlertsByStore(storeId, opts)
      : await listRecentAlerts(opts);

  const nextBefore = alerts.length === limit ? (alerts[alerts.length - 1]?.createdAt ?? null) : null;
  return NextResponse.json({ alerts, nextBefore });
}

export async function POST(req: Request) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const json = await req.json().catch(() => null);
  const body = alertCreateSchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const alert = await createAlert(body.data);
  return NextResponse.json({ alert });
}
