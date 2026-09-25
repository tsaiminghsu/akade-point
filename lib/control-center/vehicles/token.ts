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
 * Claw machines' ESP32 boards use the same scheme with the prefix "mt"
 * (lib/machine-auth.ts), so a token can't be replayed against the other kind.
 *
 * Server-only (uses node:crypto); tests run in vitest's node environment.
 */

export type TokenPrefix = "vt" | "mt";

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function formatToken(tokenId: string, secret: string, prefix: TokenPrefix = "vt"): string {
  return `${prefix}_${tokenId}_${secret}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Parses a bearer token into its id and secret, or null if malformed. The
 * secret is base64url and can itself contain "_", so we split on only the first
 * two underscores: prefix, tokenId (a cuid2, which never contains "_"), then
 * the rest is the secret verbatim.
 */
export function parseToken(
  token: string,
  expectedPrefix: TokenPrefix = "vt"
): { tokenId: string; secret: string } | null {
  const first = token.indexOf("_");
  if (first === -1) return null;
  const second = token.indexOf("_", first + 1);
  if (second === -1) return null;
  const prefix = token.slice(0, first);
  const tokenId = token.slice(first + 1, second);
  const secret = token.slice(second + 1);
  if (prefix !== expectedPrefix || !tokenId || !secret) return null;
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
