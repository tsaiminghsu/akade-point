import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";
import { createMission, listMissionsByVehicle } from "@/lib/dynamo/cc-vehicle-missions";
import { missionCreateSchema } from "@/lib/control-center/vehicles/schemas";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const missions = await listMissionsByVehicle(params.id);
  return NextResponse.json({ missions });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("mission"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const vehicle = await getVehicle(params.id);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = missionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const mission = await createMission({
    vehicleId: params.id,
    name: body.data.name,
    items: body.data.items,
    source: body.data.source ?? "editor",
    kind: body.data.kind ?? "mission",
  });
  return NextResponse.json({ mission });
}
