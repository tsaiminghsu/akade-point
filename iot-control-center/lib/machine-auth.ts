import { createId } from "@paralleldrive/cuid2";

import { formatToken, generateSecret, hashesEqual, hashToken, parseToken } from "@/lib/control-center/vehicles/token";
import { getMachineToken, putMachineToken, revokeAllForMachine } from "@/lib/dynamo/cc-machine-tokens";

/**
 * Claw machine board (ESP32) authentication, the machine counterpart of
 * lib/device-auth.ts. Tokens look like `mt_<tokenId>_<secret>`. There is
 * deliberately no NODE_ENV bypass, and the machineId always comes from the
 * verified token, never from the request.
 */
export async function requireMachineToken(req: Request): Promise<{ machineId: string; tokenId: string } | null> {
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();

  const parsed = parseToken(token, "mt");
  if (!parsed) return null;

  const row = await getMachineToken(parsed.tokenId);
  if (!row || row.revokedAt !== undefined) return null;
  if (!hashesEqual(row.hash, hashToken(token))) return null;

  return { machineId: row.machineId, tokenId: parsed.tokenId };
}

/**
 * Issues a machine's board token, revoking the previous ones (a machine has
 * one board). The plaintext is returned exactly once.
 */
export async function issueMachineToken(
  machineId: string,
  label: string
): Promise<{ token: string; tokenId: string; createdAt: number }> {
  await revokeAllForMachine(machineId);
  const tokenId = createId();
  const token = formatToken(tokenId, generateSecret(), "mt");
  const createdAt = Date.now();
  await putMachineToken({ tokenId, machineId, hash: hashToken(token), label, createdAt });
  return { token, tokenId, createdAt };
}
