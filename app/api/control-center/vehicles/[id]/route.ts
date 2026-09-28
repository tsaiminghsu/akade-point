import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { deleteVehicle, getVehicle, getVehicleByCompanionId, updateVehicle } from "@/lib/dynamo/cc-vehicles";
import { revokeAllForVehicle } from "@/lib/dynamo/cc-vehicle-tokens";
import { deleteAllForVehicle } from "@/lib/dynamo/cc-vehicle-missions";
import { deleteFile, listAllForVehicle } from "@/lib/dynamo/cc-vehicle-files";
import { fileStorage } from "@/lib/vehicle-files/storage";
import { vehiclePatchSchema } from "@/lib/control-center/vehicles/schemas";
import { toVehicleView } from "@/lib/control-center/vehicles/view";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("view", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const vehicle = await getVehicle(params.id);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ vehicle: toVehicleView(vehicle) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("manage", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = vehiclePatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (body.data.companionId) {
    const clash = await getVehicleByCompanionId(body.data.companionId);
    if (clash && clash.id !== params.id) {
      return NextResponse.json({ error: "A vehicle with this companion ID already exists" }, { status: 409 });
    }
  }
  await updateVehicle(params.id, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("manage", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Best-effort cleanup of dependents; the vehicle row goes last.
  await revokeAllForVehicle(params.id);
  await deleteAllForVehicle(params.id);
  // Its photos and logs: storage objects first, then their records.
  const storage = fileStorage();
  for (const f of await listAllForVehicle(params.id)) {
    await storage?.delete(f.key).catch(() => {});
    await deleteFile(params.id, f.fileId);
  }
  await deleteVehicle(params.id);
  return NextResponse.json({ ok: true });
}
