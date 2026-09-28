import { NextResponse } from "next/server";
import { z } from "zod";

import { requireVehicleAccess } from "@/lib/vehicle-access";
import { listFiles } from "@/lib/dynamo/cc-vehicle-files";
import { CONTENT_TYPE, FILE_KINDS, type VehicleFileView } from "@/lib/control-center/vehicles/files";
import { fileStorage } from "@/lib/vehicle-files/storage";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  kind: z.enum(FILE_KINDS),
  before: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

/** Stored photos or logs of one kind, newest first, each with short-lived links. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireVehicleAccess("view", params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const storage = fileStorage();
  if (!storage) return NextResponse.json({ files: [], nextBefore: null, storage: null });

  const rows = await listFiles(params.id, q.data.kind, { before: q.data.before, limit: q.data.limit });
  const files: VehicleFileView[] = await Promise.all(
    rows.map(async (f) => {
      const localUrl = `/api/control-center/vehicles/${params.id}/files/${f.fileId}/content`;
      const contentType = CONTENT_TYPE[f.kind];
      return {
        fileId: f.fileId,
        kind: f.kind,
        name: f.name,
        bytes: f.bytes,
        t: f.t,
        geo: f.geo ?? null,
        status: f.status,
        storedAt: f.storedAt ?? null,
        url: await storage.readUrl(f.key, { localUrl, contentType }),
        downloadUrl: await storage.readUrl(f.key, { localUrl, contentType, download: f.name }),
      };
    })
  );
  const nextBefore = rows.length === q.data.limit ? rows[rows.length - 1].fileId : null;
  return NextResponse.json({ files, nextBefore, storage: storage.kind });
}
