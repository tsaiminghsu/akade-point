import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess, requireAnyAccess, storeFilter } from "@/lib/access-server";
import { createStore, listStores, listStoresByBrand } from "@/lib/dynamo/cc-stores";

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  brandId: z.string().min(1),
});

export async function GET(req: Request) {
  const actor = await requireAnyAccess("read");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const brandId = new URL(req.url).searchParams.get("brandId");
  const stores = brandId ? await listStoresByBrand(brandId) : await listStores();
  const allowed = storeFilter(actor, "read");
  return NextResponse.json({ stores: stores.filter((s) => allowed(s.id)) });
}

/** A new store is in nobody's store grants yet: global store-admins only. */
export async function POST(req: Request) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const store = await createStore(body.data);
  return NextResponse.json({ store });
}
