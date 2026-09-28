import { NextResponse } from "next/server";

import { requireDeviceToken } from "@/lib/device-auth";
import { getFile, putPending } from "@/lib/dynamo/cc-vehicle-files";
import { CONTENT_TYPE, fileAnnounceSchema, fileIdFor, storageKey } from "@/lib/control-center/vehicles/files";
import { fileStorage } from "@/lib/vehicle-files/storage";

/**
 * The companion announces a photo or log it wants in the cloud and gets back
 * where to PUT it: a presigned S3 URL, or (local storage) a path on this app,
 * relative to its api_base. Announcing a file that is already stored answers
 * `already: true`; announcing it again while pending hands out a fresh URL.
 */
export async function POST(req: Request) {
  const auth = await requireDeviceToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storage = fileStorage();
  if (!storage) return NextResponse.json({ error: "File uploads are not configured", code: "NO_STORAGE" }, { status: 503 });

  const body = fileAnnounceSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request", issues: body.error.issues.slice(0, 3) }, { status: 400 });
  const f = body.data;
  const fileId = fileIdFor(f.kind, f.t, f.sha256);

  const existing = await getFile(auth.vehicleId, fileId);
  if (existing?.status === "stored") return NextResponse.json({ fileId, already: true });

  const key = storageKey(auth.vehicleId, fileId, f.name);
  const fresh = await putPending({
    vehicleId: auth.vehicleId,
    fileId,
    kind: f.kind,
    name: f.name,
    bytes: f.bytes,
    sha256: f.sha256,
    t: f.t,
    ...(f.geo && { geo: f.geo }),
    key,
  });
  if (!fresh) return NextResponse.json({ fileId, already: true });

  const upload = await storage.uploadTarget(key, {
    contentType: CONTENT_TYPE[f.kind],
    bytes: f.bytes,
    sha256: f.sha256,
    localUrl: `/api/device/vehicles/files/${fileId}/content`,
  });
  return NextResponse.json({ fileId, upload });
}
