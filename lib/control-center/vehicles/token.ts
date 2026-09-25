import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Device-token format and hashing. A companion authenticates to the device
 * ingest routes with a bearer token of the form:
 *
 *   vt_<tokenId>_<secret>
 *
 * tokenId is a short public id used to look the row up; secret is 32 random
 * bytes (base64url). Only sha256(fullToken) is stored, so a database leak does
 * not expose usable tokens. The plaintext is shown to the operator exactly once.
 *
 * Server-only (uses node:crypto); tests run in vitest's node environment.
 */

const PREFIX = "vt";

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function formatToken(tokenId: string, secret: string): string {
  return `${PREFIX}_${tokenId}_${secret}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Parses a bearer token into its id and secret, or null if malformed. */
export function parseToken(token: string): { tokenId: string; secret: string } | null {
  const parts = token.split("_");
  if (parts.length !== 3) return null;
  const [prefix, tokenId, secret] = parts;
  if (prefix !== PREFIX || !tokenId || !secret) return null;
  return { tokenId, secret };
}

/** Constant-time comparison of two hex digests of equal length. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
