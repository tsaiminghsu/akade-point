import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { listSnapshots } from "@/lib/dynamo/cc-vehicle-params";

/** Parameter snapshots for a vehicle, newest first (metadata only). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ snapshots: await listSnapshots(params.id) });
}
