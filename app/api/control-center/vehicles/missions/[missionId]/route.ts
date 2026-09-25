import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { deleteMission, getMission, updateMission } from "@/lib/dynamo/cc-vehicle-missions";
import { missionPatchSchema } from "@/lib/control-center/vehicles/schemas";

export async function GET(_req: Request, { params }: { params: { missionId: string } }) {
  if (!(await requireVehicleAccess("view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const mission = await getMission(params.missionId);
  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ mission });
}

export async function PATCH(req: Request, { params }: { params: { missionId: string } }) {
  if (!(await requireVehicleAccess("mission"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = missionPatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateMission(params.missionId, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { missionId: string } }) {
  if (!(await requireVehicleAccess("mission"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteMission(params.missionId);
  return NextResponse.json({ ok: true });
}
