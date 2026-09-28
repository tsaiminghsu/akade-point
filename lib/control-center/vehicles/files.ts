/**
 * Files a vehicle's companion keeps in the cloud: photos from the Pi camera
 * (with the geotag it took them at), telemetry logs (.tlog) and DataFlash
 * logs (.bin) copied off the autopilot. Pure: shared by the device routes,
 * the browser routes and the UI.
 */
import { z } from "zod";

export const FILE_KINDS = ["photo", "tlog", "dataflash"] as const;
export type VehicleFileKind = (typeof FILE_KINDS)[number];

/** Largest file accepted per kind (a single S3 PUT tops out at 5 GB). */
export const MAX_BYTES: Record<VehicleFileKind, number> = {
  photo: 40 * 1024 * 1024,
  tlog: 1024 * 1024 * 1024,
  dataflash: 2 * 1024 * 1024 * 1024,
};

export const CONTENT_TYPE: Record<VehicleFileKind, string> = {
  photo: "image/jpeg",
  tlog: "application/octet-stream",
  dataflash: "application/octet-stream",
};

const EXT: Record<VehicleFileKind, RegExp> = {
  photo: /\.jpe?g$/i,
  tlog: /\.tlog$/i,
  dataflash: /\.bin$/i,
};

/** Plain file names only: they end up in storage keys and download headers. */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const geoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  alt: z.number().nullable().optional(),
  rel: z.number().nullable().optional(),
  hdg: z.number().nullable().optional(),
});
export type FileGeo = z.infer<typeof geoSchema>;

export const fileAnnounceSchema = z
  .object({
    kind: z.enum(FILE_KINDS),
    name: z.string().regex(NAME_RE),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    /** when it was taken / the log was last written (ms, server clock as far as the companion knows it) */
    t: z.number().int().positive(),
    geo: geoSchema.nullable().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.bytes > MAX_BYTES[f.kind]) ctx.addIssue({ code: "custom", path: ["bytes"], message: "too large" });
    if (!EXT[f.kind].test(f.name)) ctx.addIssue({ code: "custom", path: ["name"], message: "wrong extension" });
    if (f.geo && f.kind !== "photo") ctx.addIssue({ code: "custom", path: ["geo"], message: "only photos carry a geotag" });
  });
export type FileAnnounce = z.infer<typeof fileAnnounceSchema>;

/**
 * `<kind>.<t, 13 digits>.<first 16 hex of sha256>`: sorts by time within a
 * kind (the table's sort key), and announcing the same file twice lands on
 * the same record, so a companion that lost its upload state after a crash
 * does not store a second copy.
 */
export function fileIdFor(kind: VehicleFileKind, t: number, sha256: string): string {
  return `${kind}.${String(Math.max(0, Math.floor(t))).padStart(13, "0")}.${sha256.slice(0, 16)}`;
}

const FILE_ID_RE = /^(photo|tlog|dataflash)\.(\d{13})\.([0-9a-f]{16})$/;

export function parseFileId(id: string): { kind: VehicleFileKind; t: number } | null {
  const m = FILE_ID_RE.exec(id);
  return m ? { kind: m[1] as VehicleFileKind, t: Number(m[2]) } : null;
}

/** Storage key: one prefix per vehicle, so a lifecycle rule or a cleanup can target it. */
export function storageKey(vehicleId: string, fileId: string, name: string): string {
  return `vehicles/${vehicleId}/${fileId.split(".")[0]}/${fileId}/${name}`;
}

/** What the browser sees. */
export interface VehicleFileView {
  fileId: string;
  kind: VehicleFileKind;
  name: string;
  bytes: number;
  t: number;
  geo: FileGeo | null;
  status: "pending" | "stored";
  storedAt: number | null;
  /** short-lived link to the content (inline); add ?download=1 locally or use downloadUrl */
  url: string | null;
  downloadUrl: string | null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
