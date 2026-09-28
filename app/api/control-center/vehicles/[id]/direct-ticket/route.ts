import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";
import { listTokensByVehicle } from "@/lib/dynamo/cc-vehicle-tokens";
import { deriveDirectKey, masterKey, newTicketPayload, signTicket } from "@/lib/control-center/vehicles/directTicket";

/**
 * Issues a short-lived ticket the browser presents to the companion's
 * WebSocket (the direct link). A "control" ticket needs command access; a
 * "view" ticket only view access. The key is derived from the vehicle's active
 * device token, which the companion was configured with.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as { scope?: string; cid?: string };
  const scope = body.scope === "view" ? "view" : "control";
  const actor = await requireVehicleAccess(scope === "control" ? "command" : "view");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const vehicle = await getVehicle(params.id);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!vehicle.directUrl) return NextResponse.json({ error: "No direct link URL is set for this vehicle" }, { status: 409 });

  const master = masterKey();
  if (!master) return NextResponse.json({ error: "Direct link signing is not configured" }, { status: 503 });

  const active = (await listTokensByVehicle(params.id)).find((t) => t.revokedAt === undefined);
  if (!active) return NextResponse.json({ error: "Generate a device token first" }, { status: 409 });

  const cid = typeof body.cid === "string" && body.cid.length <= 64 ? body.cid : undefined;
  const payload = newTicketPayload(params.id, actor.id ?? "admin", scope, Date.now(), cid);
  const ticket = signTicket(deriveDirectKey(master, params.id, active.tokenId), payload);
  return NextResponse.json({ url: vehicle.directUrl, ticket, exp: payload.exp, scope });
}
