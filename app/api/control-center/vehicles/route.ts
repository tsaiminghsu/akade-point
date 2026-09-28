import { NextResponse } from "next/server";

import { storeFilter } from "@/lib/access-server";
import { requireVehicleAccess } from "@/lib/vehicle-access";
import { createVehicle, getVehicleByCompanionId, listVehicles } from "@/lib/dynamo/cc-vehicles";
import { vehicleCreateSchema } from "@/lib/control-center/vehicles/schemas";
import { toVehicleView } from "@/lib/control-center/vehicles/view";

export async function GET() {
  const actor = await requireVehicleAccess("view", null);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const now = Date.now();
  const allowed = storeFilter(actor, "read");
  const vehicles = (await listVehicles()).filter((v) => allowed(v.storeId || null)).map((v) => toVehicleView(v, now));
  return NextResponse.json({ vehicles });
}

export async function POST(req: Request) {
  if (!(await requireVehicleAccess("manage", null))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = vehicleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // companionId doubles as the IoT Thing name, so it must be unique.
  const existing = await getVehicleByCompanionId(body.data.companionId);
  if (existing) return NextResponse.json({ error: "A vehicle with this companion ID already exists" }, { status: 409 });

  const vehicle = await createVehicle(body.data);
  return NextResponse.json({ vehicle: toVehicleView(vehicle) });
}
