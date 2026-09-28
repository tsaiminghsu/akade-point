import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { LocalStorage, putExpirySeconds } from "./storage";

const stream = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(new TextEncoder().encode(p));
      c.close();
    },
  });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("local vehicle-file storage", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vf-"));
  const store = new LocalStorage(root);
  afterAll(() => rm(root, { recursive: true, force: true }));
  const key = "vehicles/v1/photo/photo.0000000000001.aaaaaaaaaaaaaaaa/IMG_1.jpg";

  it("keeps a file whose size and SHA-256 match", async () => {
    expect(await store.write(key, stream("hello ", "world"), { bytes: 11, sha256: sha("hello world") })).toBe("ok");
    expect(await store.size(key)).toBe(11);
    expect(await readFile(store.pathFor(key), "utf8")).toBe("hello world");
  });

  it("refuses short, long and corrupted uploads without touching what is stored", async () => {
    expect(await store.write(key, stream("hello"), { bytes: 11, sha256: sha("hello world") })).toBe("size");
    expect(await store.write(key, stream("hello world!!"), { bytes: 11, sha256: sha("hello world") })).toBe("size");
    expect(await store.write(key, stream("hello WORLD"), { bytes: 11, sha256: sha("hello world") })).toBe("sha");
    expect(await readFile(store.pathFor(key), "utf8")).toBe("hello world");
  });

  it("never leaves its root", () => {
    expect(() => store.pathFor("../../etc/passwd")).toThrow();
    expect(() => store.pathFor("/abs")).toThrow();
  });

  it("deletes a file with its folder", async () => {
    await store.delete(key);
    expect(await store.size(key)).toBeNull();
  });
});

describe("presigned PUT lifetime", () => {
  it("allows for a slow uplink, within bounds", () => {
    expect(putExpirySeconds(1000)).toBe(900);
    expect(putExpirySeconds(200 * 1024 * 1024)).toBeGreaterThan(4000);
    expect(putExpirySeconds(5 * 1024 * 1024 * 1024)).toBe(12 * 3600);
  });
});
