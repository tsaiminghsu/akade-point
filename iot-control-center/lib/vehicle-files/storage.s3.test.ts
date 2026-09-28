import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Presigning is local: fake credentials are enough to check what gets signed.
beforeAll(() => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("VEHICLE_FILES_BUCKET", "akade-vehicle-files-test");
  vi.stubEnv("VEHICLE_FILES_REGION", "ap-northeast-1");
});
afterAll(() => vi.unstubAllEnvs());

const SHA = "b".repeat(64);

describe("S3 vehicle-file storage", () => {
  it("presigns a PUT the companion can satisfy: type, length and SHA-256, no SDK CRC32", async () => {
    vi.resetModules();
    const { fileStorage } = await import("./storage");
    const s = fileStorage()!;
    expect(s.kind).toBe("s3");
    const target = await s.uploadTarget("vehicles/v1/photo/x/IMG_1.jpg", { contentType: "image/jpeg", bytes: 1234, sha256: SHA, localUrl: "" });
    const url = new URL(target.url);
    expect(url.hostname).toBe("akade-vehicle-files-test.s3.ap-northeast-1.amazonaws.com");
    expect(url.pathname).toBe("/vehicles/v1/photo/x/IMG_1.jpg");
    const signed = url.searchParams.get("X-Amz-SignedHeaders")!.split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-length", "content-type", "host", "x-amz-checksum-sha256"]));
    // The SDK's flexible-checksum default would demand a CRC32 the companion never sends.
    expect([...url.searchParams.keys()].some((k) => /crc32|sdk-checksum/i.test(k))).toBe(false);
    expect(target.auth).toBe(false);
    expect(target.headers["x-amz-checksum-sha256"]).toBe(Buffer.from(SHA, "hex").toString("base64"));
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBe(900);
  });

  it("presigns downloads with the file name", async () => {
    vi.resetModules();
    const { fileStorage } = await import("./storage");
    const url = new URL(await fileStorage()!.readUrl("vehicles/v1/tlog/x/a.tlog", { localUrl: "", contentType: "application/octet-stream", download: "a.tlog" }));
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="a.tlog"');
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
  });
});
