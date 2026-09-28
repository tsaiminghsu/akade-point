import { NextResponse } from "next/server";

import { canAt, requireAnyAccess } from "@/lib/access-server";
import { storesAllowing } from "@/lib/control-center/access";
import { getMachine } from "@/lib/dynamo/cc-machines";
import {
  createEvent,
  listEventsByMachine,
  listEventsByStore,
  listRecentEvents,
} from "@/lib/dynamo/cc-machine-events";
import { eventCreateSchema, recentQuerySchema } from "./schema";

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
  const events = machineId
    ? await listEventsByMachine(machineId, opts)
    : storeId
      ? await listEventsByStore(storeId, opts)
      : await listRecentEvents(opts, where === "all" ? undefined : where);

  // `nextBefore` is an exclusive upper bound, so a page boundary that falls
  // inside one simulation tick (many events sharing a timestamp) can skip the
  // rest of that tick. Acceptable for history browsing; revisit if paging ever
  // needs to be exact.
  const nextBefore = events.length === limit ? (events[events.length - 1]?.timestamp ?? null) : null;
  return NextResponse.json({ events, nextBefore });
}

export async function POST(req: Request) {
  const actor = await requireAnyAccess("simulate");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const json = await req.json().catch(() => null);
  const body = eventCreateSchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!canAt(actor, "simulate", body.data.storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { timestamp, ...rest } = body.data;
  const event = await createEvent({ ...rest, timestamp: timestamp ?? Date.now() });
  return NextResponse.json({ event });
}
