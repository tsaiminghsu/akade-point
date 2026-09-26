import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { putSnapshot } from "@/lib/dynamo/cc-vehicle-params";
import { paramSnapshotSchema } from "@/lib/control-center/vehicles/schemas";

/** The companion posts the full parameter table after a param_fetch. */
export async function POST(req: Request) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = paramSnapshotSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const capturedAt = Date.now();
  await putSnapshot({
    vehicleId: auth.vehicleId,
    capturedAt,
    params: body.data.params,
    count: Object.keys(body.data.params).length,
    fw: body.data.fw ?? null,
    commandId: body.data.commandId ?? null,
  });
  return NextResponse.json({ ok: true, capturedAt });
}
