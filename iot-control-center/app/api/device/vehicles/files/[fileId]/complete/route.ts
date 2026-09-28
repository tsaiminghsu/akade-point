import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { getFile, markStored } from "@/lib/dynamo/cc-vehicle-files";
import { fileStorage, retentionDays } from "@/lib/vehicle-files/storage";

/**
 * The companion's upload finished: check the object is really there with the
 * announced size (S3 already verified the checksum on PUT; local storage did
 * while writing) and show the file.
 */
export async function POST(req: Request, { params }: { params: { fileId: string } }) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storage = fileStorage();
  if (!storage) return NextResponse.json({ error: "File uploads are not configured", code: "NO_STORAGE" }, { status: 503 });

  const file = await getFile(auth.vehicleId, params.fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (file.status === "stored") return NextResponse.json({ ok: true, already: true });

  const size = await storage.size(file.key);
  if (size === null) return NextResponse.json({ error: "Upload not found", code: "MISSING" }, { status: 409 });
  if (size !== file.bytes) return NextResponse.json({ error: "Size mismatch", code: "SIZE" }, { status: 409 });

  const now = Date.now();
  await markStored(auth.vehicleId, file.fileId, now, Math.floor(now / 1000) + retentionDays() * 86400);
  return NextResponse.json({ ok: true });
}
