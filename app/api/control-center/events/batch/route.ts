import { NextResponse } from "next/server";

import { requireAccess } from "@/lib/access-server";
import { createEvents } from "@/lib/dynamo/cc-machine-events";
import { eventBatchSchema } from "../schema";

/** Bulk-writes telemetry events. Live Mode produces a burst every tick, so it
 *  posts one batch instead of one request per event. Records come back in the
 *  same order they were sent, carrying their server-assigned ids. */
export async function POST(req: Request) {
  if (!(await requireAccess("simulate"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const body = eventBatchSchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const now = Date.now();
  const events = await createEvents(
    body.data.events.map(({ timestamp, ...rest }) => ({ ...rest, timestamp: timestamp ?? now }))
  );
  return NextResponse.json({ events });
}
