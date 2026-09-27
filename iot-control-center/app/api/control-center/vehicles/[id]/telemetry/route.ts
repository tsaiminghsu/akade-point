import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { listPoints } from "@/lib/dynamo/cc-vehicle-telemetry";
import { historyQuerySchema } from "@/lib/control-center/vehicles/schemas";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const query = historyQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!query.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const points = await listPoints(params.id, query.data);
  return NextResponse.json({ points });
}
