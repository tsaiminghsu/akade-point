import { NextResponse } from "next/server";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { getFile } from "@/lib/dynamo/cc-vehicle-files";
import { CONTENT_TYPE } from "@/lib/control-center/vehicles/files";
import { fileStorage, LocalStorage } from "@/lib/vehicle-files/storage";

export const dynamic = "force-dynamic";

/**
 * A stored file's bytes: streamed from local storage, or a redirect to a
 * fresh presigned S3 link (stable URL for bookmarks and <img>).
 * `?download=1` saves it under its own name.
 */
export async function GET(req: Request, { params }: { params: { id: string; fileId: string } }) {
  if (!(await requireVehicleAccess("view", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const storage = fileStorage();
  const file = await getFile(params.id, params.fileId);
  if (!storage || !file || file.status !== "stored") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const contentType = CONTENT_TYPE[file.kind];

  if (!(storage instanceof LocalStorage)) {
    const url = await storage.readUrl(file.key, { localUrl: "", contentType, download: download ? file.name : undefined });
    return NextResponse.redirect(url, 302);
  }
  if ((await storage.size(file.key)) === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(storage.read(file.key), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.bytes),
      "Cache-Control": "private, max-age=3600",
      ...(download && { "Content-Disposition": `attachment; filename="${file.name}"` }),
    },
  });
}
