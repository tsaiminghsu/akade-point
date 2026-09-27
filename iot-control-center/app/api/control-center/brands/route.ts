import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrDevBypass } from "@/lib/session";
import { createBrand, listBrands } from "@/lib/dynamo/cc-brands";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  color: z.string().min(1),
});

export async function GET() {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const brands = await listBrands();
  return NextResponse.json({ brands });
}

export async function POST(req: Request) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const brand = await createBrand(body.data);
  return NextResponse.json({ brand });
}
