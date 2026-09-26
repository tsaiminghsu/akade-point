import { NextResponse } from "next/server";
import {
  FLEET_LIMITS, StoreUnavailableError, isShopCode, parseFleetBody, toGameFleet,
} from "@/lib/claw-machine/fleetRepository";
import { getFleetRepository, storeEnabled } from "@/lib/claw-machine/fleetStore";

// The claw machines' settings for a shop: GET loads them, PUT saves the
// whole fleet, DELETE clears it. `?shop=` picks the shop ("default" if
// left out). See lib/claw-machine/fleetRepository.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shopOf(req: Request): string | null {
  const shop = new URL(req.url).searchParams.get("shop") ?? "default";
  return isShopCode(shop) ? shop : null;
}

/** Run a store call, turning "no store here" into a 503 and the store being off into a 404. */
async function withStore(req: Request, run: (shop: string) => Promise<Response>): Promise<Response> {
  if (!storeEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const shop = shopOf(req);
  if (!shop) return NextResponse.json({ error: "Bad shop code" }, { status: 400 });
  try {
    return await run(shop);
  } catch (e) {
    if (e instanceof StoreUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}

export async function GET(req: Request) {
  return withStore(req, async (shop) => {
    const stored = await getFleetRepository().load(shop);
    return NextResponse.json(stored ? { fleet: toGameFleet(stored), savedAt: stored.savedAt } : { fleet: null, savedAt: null });
  });
}

export async function PUT(req: Request) {
  return withStore(req, async (shop) => {
    const text = await req.text();
    if (text.length > FLEET_LIMITS.body) return NextResponse.json({ error: "Too large" }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }
    const fleet = parseFleetBody(body);
    if (!fleet) return NextResponse.json({ error: "Not a fleet" }, { status: 400 });
    await getFleetRepository().save(shop, fleet);
    return NextResponse.json({ ok: true, savedAt: fleet.savedAt });
  });
}

export async function DELETE(req: Request) {
  return withStore(req, async (shop) => {
    await getFleetRepository().remove(shop);
    return NextResponse.json({ ok: true });
  });
}
