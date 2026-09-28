import { NextResponse } from "next/server";
import { z } from "zod";
import { canAt, requireAccessAt, requireAnyAccess, storeFilter } from "@/lib/access-server";
import { createGroup, listGroups, listGroupsByStore } from "@/lib/dynamo/cc-groups";

const createSchema = z.object({
  name: z.string().min(1),
  storeId: z.string().min(1),
});

export async function GET(req: Request) {
  const actor = await requireAnyAccess("read");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const storeId = new URL(req.url).searchParams.get("storeId");
  if (storeId && !canAt(actor, "read", storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const groups = storeId ? await listGroupsByStore(storeId) : await listGroups();
  const allowed = storeFilter(actor, "read");
  return NextResponse.json({ groups: groups.filter((g) => allowed(g.storeId)) });
}

export async function POST(req: Request) {
  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!(await requireAccessAt("store.manage", body.success ? body.data.storeId : undefined))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const group = await createGroup(body.data);
  return NextResponse.json({ group });
}
