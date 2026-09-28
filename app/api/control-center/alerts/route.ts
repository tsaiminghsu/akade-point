import { NextResponse } from "next/server";

import { canAt, requireAnyAccess } from "@/lib/access-server";
import { storesAllowing } from "@/lib/control-center/access";
import { getMachine } from "@/lib/dynamo/cc-machines";
import { createAlert, listAlertsByMachine, listAlertsByStore, listRecentAlerts } from "@/lib/dynamo/cc-alerts";
import { recentQuerySchema } from "../events/schema";
import { alertCreateSchema } from "./schema";

export async function GET(req: Request) {
  const actor = await requireAnyAccess("read");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const query = recentQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!query.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { limit, before, storeId, machineId } = query.data;
  const opts = { limit, before };
  if (storeId && !canAt(actor, "read", storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (machineId && !canAt(actor, "read", (await getMachine(machineId))?.storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const where = storesAllowing(actor, "read");
  const alerts = machineId
    ? await listAlertsByMachine(machineId, opts)
    : storeId
      ? await listAlertsByStore(storeId, opts)
      : await listRecentAlerts(opts, where === "all" ? undefined : where);

  const nextBefore = alerts.length === limit ? (alerts[alerts.length - 1]?.createdAt ?? null) : null;
  return NextResponse.json({ alerts, nextBefore });
}

export async function POST(req: Request) {
  const actor = await requireAnyAccess("simulate");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const json = await req.json().catch(() => null);
  const body = alertCreateSchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!canAt(actor, "simulate", body.data.storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const alert = await createAlert(body.data);
  return NextResponse.json({ alert });
}
