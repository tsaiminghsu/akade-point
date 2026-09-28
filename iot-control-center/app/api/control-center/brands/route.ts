import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess, requireAnyAccess } from "@/lib/access-server";
import { createBrand, listBrands } from "@/lib/dynamo/cc-brands";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  color: z.string().min(1),
});

export async function GET() {
  // Brand names show next to any store; brand writes stay global.
  if (!(await requireAnyAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const brands = await listBrands();
  return NextResponse.json({ brands });
}

export async function POST(req: Request) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const brand = await createBrand(body.data);
  return NextResponse.json({ brand });
}
