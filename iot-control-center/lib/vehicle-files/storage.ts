import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Where vehicle files (photos, logs) live.
 *
 * - **s3** (`VEHICLE_FILES_BUCKET`): the companion PUTs straight to S3 with a
 *   presigned URL, so large logs never pass through the app server; the
 *   browser reads through presigned GETs. S3 checks the SHA-256 the companion
 *   announced (x-amz-checksum-sha256), so a corrupted upload is refused.
 * - **local** (`VEHICLE_FILES_DIR`, or `.data/vehicle-files` outside
 *   production): files on this server's disk, uploaded and served through the
 *   app's own routes. For development and single-server installs; on a
 *   serverless host the disk is not kept, hence off in production unless the
 *   directory is set explicitly.
 *
 * VEHICLE_FILES_ENDPOINT points the S3 client elsewhere (MinIO, moto) with
 * path-style addressing.
 */

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  /** send the device token too (our own route); never to S3 */
  auth: boolean;
  expiresAt: number;
}

export interface FileStorage {
  readonly kind: "s3" | "local";
  uploadTarget(key: string, opts: { contentType: string; bytes: number; sha256: string; localUrl: string }): Promise<UploadTarget>;
  /** size of the stored object, or null if it is not there */
  size(key: string): Promise<number | null>;
  /** a link the browser can load: presigned for S3, our route for local */
  readUrl(key: string, opts: { localUrl: string; download?: string; contentType: string }): Promise<string>;
  delete(key: string): Promise<void>;
}

const hexToB64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");

/** Presigned PUTs last long enough for a big log over a slow 4G uplink (≥ 50 KB/s), capped at 12 h. */
export function putExpirySeconds(bytes: number): number {
  return Math.min(12 * 3600, Math.max(900, Math.ceil(bytes / 50_000) + 300));
}

class S3Storage implements FileStorage {
  readonly kind = "s3" as const;
  private client: S3Client;

  constructor(private bucket: string) {
    const endpoint = process.env.VEHICLE_FILES_ENDPOINT;
    this.client = new S3Client({
      region: process.env.VEHICLE_FILES_REGION ?? process.env.AWS_REGION ?? "ap-northeast-1",
      // Presigned URLs must not carry the SDK's default CRC32 checksum: the
      // companion sends the SHA-256 we sign instead.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      ...(endpoint && { endpoint, forcePathStyle: true }),
    });
  }

  async uploadTarget(key: string, opts: { contentType: string; bytes: number; sha256: string }): Promise<UploadTarget> {
    const expiresIn = putExpirySeconds(opts.bytes);
    const checksum = hexToB64(opts.sha256);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType, ContentLength: opts.bytes, ChecksumSHA256: checksum }),
      {
        expiresIn,
        signableHeaders: new Set(["content-type", "content-length", "x-amz-checksum-sha256"]),
        // Kept as a signed header (not hoisted into the query), so the PUT must carry exactly this checksum.
        unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
      }
    );
    return {
      url,
      method: "PUT",
      headers: { "Content-Type": opts.contentType, "x-amz-checksum-sha256": checksum },
      auth: false,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }

  async size(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async readUrl(key: string, opts: { download?: string; contentType: string }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ...(opts.download && { ResponseContentDisposition: `attachment; filename="${opts.download}"` }),
      }),
      { expiresIn: 3600 }
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class LocalStorage implements FileStorage {
  readonly kind = "local" as const;
  constructor(readonly root: string) {}

  /** Keys come from storageKey() (validated ids and names); still refuse anything that escapes the root. */
  pathFor(key: string): string {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("bad key");
    return p;
  }

  async uploadTarget(_key: string, opts: { contentType: string; localUrl: string }): Promise<UploadTarget> {
    return { url: opts.localUrl, method: "PUT", headers: { "Content-Type": opts.contentType }, auth: true, expiresAt: Date.now() + 12 * 3600_000 };
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(key))).size;
    } catch {
      return null;
    }
  }

  async readUrl(_key: string, opts: { localUrl: string; download?: string }): Promise<string> {
    return opts.download ? `${opts.localUrl}?download=1` : opts.localUrl;
  }

  async delete(key: string): Promise<void> {
    const p = this.pathFor(key);
    await rm(path.dirname(p), { recursive: true, force: true });
  }

  /**
   * Streams an upload to disk, checking size and SHA-256 on the way; only a
   * complete, matching file replaces what is there.
   */
  async write(key: string, body: ReadableStream<Uint8Array>, expect: { bytes: number; sha256: string }): Promise<"ok" | "size" | "sha"> {
    const dest = this.pathFor(key);
    await mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${randomBytes(4).toString("hex")}.part`;
    const fh = await open(tmp, "w");
    const hash = createHash("sha256");
    let n = 0;
    let verdict: "ok" | "size" | "sha" = "ok";
    try {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        n += value.byteLength;
        if (n > expect.bytes) {
          verdict = "size";
          await reader.cancel();
          break;
        }
        hash.update(value);
        await fh.write(value);
      }
    } finally {
      await fh.close();
    }
    if (verdict === "ok" && n !== expect.bytes) verdict = "size";
    if (verdict === "ok" && hash.digest("hex") !== expect.sha256) verdict = "sha";
    if (verdict !== "ok") {
      await unlink(tmp).catch(() => {});
      return verdict;
    }
    await rename(tmp, dest);
    return "ok";
  }

  read(key: string): ReadableStream<Uint8Array> {
    return Readable.toWeb(createReadStream(this.pathFor(key))) as ReadableStream<Uint8Array>;
  }
}

let cached: FileStorage | null | undefined;

/** The configured storage, or null when uploads are off (production without a bucket or directory). */
export function fileStorage(): FileStorage | null {
  if (cached !== undefined) return cached;
  const bucket = process.env.VEHICLE_FILES_BUCKET;
  const dir = process.env.VEHICLE_FILES_DIR || (process.env.NODE_ENV !== "production" ? path.join(process.cwd(), ".data", "vehicle-files") : "");
  cached = bucket ? new S3Storage(bucket) : dir ? new LocalStorage(dir) : null;
  return cached;
}

/** Days a stored file is kept (DynamoDB TTL; match it with an S3 lifecycle rule on vehicles/). */
export function retentionDays(): number {
  const n = Number(process.env.VEHICLE_FILES_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 90;
}
