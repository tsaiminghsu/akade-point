import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-server";
import { createStore, listStores, listStoresByBrand } from "@/lib/dynamo/cc-stores";

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  brandId: z.string().min(1),
});

export async function GET(req: Request) {
  if (!(await requireAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const brandId = new URL(req.url).searchParams.get("brandId");
  const stores = brandId ? await listStoresByBrand(brandId) : await listStores();
  return NextResponse.json({ stores });
}

export async function POST(req: Request) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const store = await createStore(body.data);
  return NextResponse.json({ store });
}
