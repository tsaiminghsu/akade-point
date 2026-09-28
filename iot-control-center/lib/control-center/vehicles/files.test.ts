import { describe, expect, it } from "vitest";

import { fileAnnounceSchema, fileIdFor, formatBytes, MAX_BYTES, parseFileId, storageKey } from "./files";

const SHA = "a".repeat(64);
const photo = { kind: "photo", name: "IMG_00001_20260928T120000Z.jpg", bytes: 123_456, sha256: SHA, t: 1_759_060_800_000 };

describe("vehicle files", () => {
  it("makes sortable, idempotent ids", () => {
    const id = fileIdFor("photo", 1_759_060_800_000, SHA);
    expect(id).toBe("photo.1759060800000.aaaaaaaaaaaaaaaa");
    expect(fileIdFor("photo", 1_759_060_800_000, SHA)).toBe(id);
    expect(parseFileId(id)).toEqual({ kind: "photo", t: 1_759_060_800_000 });
    // zero-padded, so string order is time order
    expect(fileIdFor("tlog", 5, SHA) < fileIdFor("tlog", 1_000_000_000_000, SHA)).toBe(true);
    expect(parseFileId("photo.1.abc")).toBeNull();
    expect(parseFileId("../etc")).toBeNull();
    expect(storageKey("v1", id, photo.name)).toBe(`vehicles/v1/photo/${id}/${photo.name}`);
  });

  it("accepts what the companion sends", () => {
    expect(fileAnnounceSchema.safeParse(photo).success).toBe(true);
    expect(fileAnnounceSchema.safeParse({ ...photo, geo: { lat: 24.1, lon: 120.6, alt: 50, rel: 20, hdg: null } }).success).toBe(true);
    expect(fileAnnounceSchema.safeParse({ ...photo, kind: "tlog", name: "20260928-120000-flight.tlog" }).success).toBe(true);
    expect(fileAnnounceSchema.safeParse({ ...photo, kind: "dataflash", name: "003-20260928T120000Z.bin" }).success).toBe(true);
  });

  it("refuses paths, wrong extensions, oversize files and stray geotags", () => {
    expect(fileAnnounceSchema.safeParse({ ...photo, name: "../x.jpg" }).success).toBe(false);
    expect(fileAnnounceSchema.safeParse({ ...photo, name: "a/b.jpg" }).success).toBe(false);
    expect(fileAnnounceSchema.safeParse({ ...photo, name: "IMG.png" }).success).toBe(false);
    expect(fileAnnounceSchema.safeParse({ ...photo, bytes: MAX_BYTES.photo + 1 }).success).toBe(false);
    expect(fileAnnounceSchema.safeParse({ ...photo, sha256: "xyz" }).success).toBe(false);
    expect(fileAnnounceSchema.safeParse({ ...photo, kind: "tlog", name: "a.tlog", geo: { lat: 1, lon: 1 } }).success).toBe(false);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
