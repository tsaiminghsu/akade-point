import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrDevBypass } from "@/lib/session";
import { createGroup, listGroups, listGroupsByStore } from "@/lib/dynamo/cc-groups";

const createSchema = z.object({
  name: z.string().min(1),
  storeId: z.string().min(1),
});

export async function GET(req: Request) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const storeId = new URL(req.url).searchParams.get("storeId");
  const groups = storeId ? await listGroupsByStore(storeId) : await listGroups();
  return NextResponse.json({ groups });
}

export async function POST(req: Request) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const group = await createGroup(body.data);
  return NextResponse.json({ group });
}
