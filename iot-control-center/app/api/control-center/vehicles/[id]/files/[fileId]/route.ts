import { NextResponse } from "next/server";

import { requireAccessAt } from "@/lib/access-server";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";
import { deleteFile, getFile } from "@/lib/dynamo/cc-vehicle-files";
import { fileStorage } from "@/lib/vehicle-files/storage";

/** Deletes a stored photo or log: store-admins of the vehicle's store. */
export async function DELETE(_req: Request, { params }: { params: { id: string; fileId: string } }) {
  const vehicle = await getVehicle(params.id);
  if (!(await requireAccessAt("store.manage", vehicle?.storeId || null))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const file = await getFile(params.id, params.fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await fileStorage()?.delete(file.key);
  await deleteFile(params.id, params.fileId);
  return NextResponse.json({ ok: true });
}
