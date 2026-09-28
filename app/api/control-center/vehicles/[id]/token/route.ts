import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";
import { issueDeviceToken } from "@/lib/device-auth";
import { listTokensByVehicle } from "@/lib/dynamo/cc-vehicle-tokens";
import { deriveDirectKey, masterKey } from "@/lib/control-center/vehicles/directTicket";

/** Token metadata (no hashes, no plaintext). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("provision", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tokens = (await listTokensByVehicle(params.id)).map((t) => ({
    tokenId: t.tokenId,
    label: t.label,
    createdAt: t.createdAt,
    revokedAt: t.revokedAt ?? null,
  }));
  return NextResponse.json({ tokens });
}

/** Issues a new token, revoking any previous ones. Plaintext is returned once. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("provision", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const vehicle = await getVehicle(params.id);
  if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : "companion";
  const issued = await issueDeviceToken(params.id, label);
  // The companion's direct-link key is derived from this token, so it is
  // shown once alongside it (null when no signing secret is configured).
  const master = masterKey();
  const directKey = master ? deriveDirectKey(master, params.id, issued.tokenId) : null;
  return NextResponse.json({ ...issued, directKey });
}
