/**
 * Opt-in: the S3 storage against a real S3-compatible endpoint (LocalStack,
 * a test bucket). Skipped unless VEHICLE_FILES_LIVE_ENDPOINT is set, e.g.
 *
 *   docker run -d -p 4566:4566 -e SERVICES=s3 localstack/localstack:4.12
 *   VEHICLE_FILES_LIVE_ENDPOINT=http://localhost:4566 npx vitest run lib/vehicle-files/storage.live.test.ts
 *
 * Uses AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from the environment, or
 * LocalStack's test/test.
 */
import { createHash } from "node:crypto";

import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { FileStorage } from "./storage";

const endpoint = process.env.VEHICLE_FILES_LIVE_ENDPOINT;
const bucket = `akade-vf-test-${Date.now()}`;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe.skipIf(!endpoint)("S3 vehicle-file storage against a live endpoint", () => {
  let s: FileStorage;
  const body = Buffer.from("\xff\xd8 live S3 test photo \xff\xd9".repeat(200), "latin1");
  const key = "vehicles/v1/photo/photo.0000000000001.aaaaaaaaaaaaaaaa/IMG_LIVE.jpg";

  beforeAll(async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", process.env.AWS_ACCESS_KEY_ID ?? "test");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", process.env.AWS_SECRET_ACCESS_KEY ?? "test");
    vi.stubEnv("VEHICLE_FILES_BUCKET", bucket);
    vi.stubEnv("VEHICLE_FILES_ENDPOINT", endpoint!);
    vi.stubEnv("VEHICLE_FILES_REGION", "us-east-1");
    await new S3Client({ region: "us-east-1", endpoint, forcePathStyle: true }).send(new CreateBucketCommand({ Bucket: bucket }));
    vi.resetModules();
    s = (await import("./storage")).fileStorage()!;
  });
  afterAll(() => vi.unstubAllEnvs());

  const put = async (target: { url: string; headers: Record<string, string> }, data: Buffer, headers = target.headers) =>
    fetch(target.url, { method: "PUT", headers, body: data });

  it("refuses a body that does not match the announced SHA-256", async () => {
    const t = await s.uploadTarget(key, { contentType: "image/jpeg", bytes: body.length, sha256: sha(body), localUrl: "" });
    const tampered = Buffer.from(body);
    tampered[10] ^= 0xff;
    const res = await put(t, tampered);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await s.size(key)).toBeNull();
  });

  it("refuses a PUT whose Content-Type differs from the signed one", async () => {
    const t = await s.uploadTarget(key, { contentType: "image/jpeg", bytes: body.length, sha256: sha(body), localUrl: "" });
    const res = await put(t, body, { ...t.headers, "Content-Type": "text/plain" });
    expect(res.status).toBe(403);
  });

  it("refuses a PUT without the checksum header", async () => {
    const t = await s.uploadTarget(key, { contentType: "image/jpeg", bytes: body.length, sha256: sha(body), localUrl: "" });
    const res = await put(t, body, { "Content-Type": "image/jpeg" });
    expect(res.status).toBe(403);
  });

  it("refuses a body of another length", async () => {
    const t = await s.uploadTarget(key, { contentType: "image/jpeg", bytes: body.length, sha256: sha(body), localUrl: "" });
    const res = await put(t, body.subarray(1));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("stores the right body, serves it back through a presigned GET and deletes it", async () => {
    const t = await s.uploadTarget(key, { contentType: "image/jpeg", bytes: body.length, sha256: sha(body), localUrl: "" });
    expect(t.auth).toBe(false);
    const res = await put(t, body);
    expect(res.status).toBe(200);
    expect(await s.size(key)).toBe(body.length);

    const get = await fetch(await s.readUrl(key, { localUrl: "", contentType: "image/jpeg", download: "IMG_LIVE.jpg" }));
    expect(get.status).toBe(200);
    expect(get.headers.get("content-disposition")).toBe('attachment; filename="IMG_LIVE.jpg"');
    expect(sha(Buffer.from(await get.arrayBuffer()))).toBe(sha(body));

    await s.delete(key);
    expect(await s.size(key)).toBeNull();
  });
});
