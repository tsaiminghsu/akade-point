import { createId } from "@paralleldrive/cuid2";

import { formatToken, generateSecret, hashesEqual, hashToken, parseToken } from "@/lib/control-center/vehicles/token";
import { getToken, putToken, revokeAllForVehicle } from "@/lib/dynamo/cc-vehicle-tokens";

/**
 * Companion (device) authentication. Distinct from requireAdminOrDevBypass:
 * companions present a bearer device token, and there is deliberately NO
 * NODE_ENV bypass here — a device route is never open just because it runs
 * outside production. The vehicleId is always taken from the verified token,
 * never from the request body or path.
 */
export async function requireDeviceToken(req: Request): Promise<{ vehicleId: string; tokenId: string } | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const parsed = parseToken(match[1].trim());
  if (!parsed) return null;

  const row = await getToken(parsed.tokenId);
  if (!row || row.revokedAt !== undefined) return null;
  if (!hashesEqual(row.hash, hashToken(match[1].trim()))) return null;

  return { vehicleId: row.vehicleId, tokenId: parsed.tokenId };
}

/**
 * Issues a fresh device token for a vehicle, revoking any previous ones
 * (non-overlapping rotation). Returns the plaintext exactly once — it is never
 * recoverable afterward.
 */
export async function issueDeviceToken(
  vehicleId: string,
  label: string
): Promise<{ token: string; tokenId: string; createdAt: number }> {
  await revokeAllForVehicle(vehicleId);
  const tokenId = createId();
  const secret = generateSecret();
  const token = formatToken(tokenId, secret);
  const createdAt = Date.now();
  await putToken({ tokenId, vehicleId, hash: hashToken(token), label, createdAt });
  return { token, tokenId, createdAt };
}
