import { NextResponse } from "next/server";
import { z } from "zod";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { acquireLease, getVehicle, releaseLease } from "@/lib/dynamo/cc-vehicles";
import { putEvents } from "@/lib/dynamo/cc-vehicle-events";
import { activeLease } from "@/lib/control-center/vehicles/lease";

const bodySchema = z.object({
  action: z.enum(["acquire", "release"]),
  /** the ground-station page (random per page load) */
  cid: z.string().min(8).max(64),
  /** take over from another operator (the page asks for confirmation first) */
  force: z.boolean().optional(),
});

/**
 * Take, renew or give back control of a vehicle (lib/control-center/vehicles/lease.ts).
 * The ground station calls acquire when the operator switches control on and
 * every few seconds while it stays on; release when it is switched off.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const actor = await requireVehicleAccess("command");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const vehicle = await getVehicle(params.id);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const now = Date.now();

  if (body.data.action === "release") {
    await releaseLease(params.id, body.data.cid);
    return NextResponse.json({ held: false, lease: null, now });
  }

  const previous = activeLease(vehicle.controlLease, now);
  const { held, lease } = await acquireLease(
    params.id,
    { cid: body.data.cid, sub: actor.id ?? "admin", name: actor.name ?? actor.id ?? "admin" },
    now,
    body.data.force === true
  );
  // A takeover goes into the vehicle's message log, which every operator sees.
  if (held && previous && previous.cid !== body.data.cid) {
    const who = actor.name ?? actor.id ?? "admin";
    await putEvents(params.id, [{ seq: now % 1_000_000_000, t: now, sev: 4, text: `Control taken over by ${who} from ${previous.name}`, comp: 0 }]);
  }
  return NextResponse.json({ held, lease: activeLease(lease, now), now }, { status: held ? 200 : 409 });
}
