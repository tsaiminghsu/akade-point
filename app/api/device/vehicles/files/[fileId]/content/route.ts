import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { getFile } from "@/lib/dynamo/cc-vehicle-files";
import { fileStorage, LocalStorage } from "@/lib/vehicle-files/storage";

export const dynamic = "force-dynamic";

/**
 * Local storage only: the upload itself (S3 uploads go straight to S3). The
 * body is streamed to disk and must match the announced size and SHA-256.
 */
export async function PUT(req: Request, { params }: { params: { fileId: string } }) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storage = fileStorage();
  if (!(storage instanceof LocalStorage)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = await getFile(auth.vehicleId, params.fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (file.status === "stored") return NextResponse.json({ ok: true, already: true });
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared !== file.bytes) return NextResponse.json({ error: "Size mismatch", code: "SIZE" }, { status: 400 });
  if (!req.body) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const verdict = await storage.write(file.key, req.body, { bytes: file.bytes, sha256: file.sha256 });
  if (verdict === "size") return NextResponse.json({ error: "Size mismatch", code: "SIZE" }, { status: 400 });
  if (verdict === "sha") return NextResponse.json({ error: "Checksum mismatch", code: "SHA" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
