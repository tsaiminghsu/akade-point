import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getSnapshot } from "@/lib/dynamo/cc-vehicle-params";

/** One parameter snapshot with its full table. */
export async function GET(_req: Request, { params }: { params: { id: string; capturedAt: string } }) {
  if (!(await requireVehicleAccess("view", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const at = Number(params.capturedAt);
  if (!Number.isFinite(at)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const snapshot = await getSnapshot(params.id, at);
  if (!snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ snapshot });
}
