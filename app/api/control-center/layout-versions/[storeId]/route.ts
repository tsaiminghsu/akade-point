import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-server";
import { createVersion, listVersionsByStore } from "@/lib/dynamo/cc-layout-versions";
import type { Widget } from "@/lib/control-center/types";

// DynamoDB items cap out at 400KB; leave headroom for the rest of the item
// (name/savedAt/keys) and reject oversized widget arrays before parsing.
const MAX_PAYLOAD_BYTES = 350_000;

const widgetSchema = z.record(z.string(), z.unknown());

const createSchema = z.object({
  name: z.string().min(1),
  widgets: z.array(widgetSchema),
});

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  if (!(await requireAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const versions = await listVersionsByStore(params.storeId);
  return NextResponse.json({ versions });
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const version = await createVersion(params.storeId, body.data.name, body.data.widgets as unknown as Widget[]);
  return NextResponse.json({ version });
}
