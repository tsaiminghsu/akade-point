import { createHash, randomBytes } from "crypto";

export function createCommitment(): { serverSeed: string; serverSeedHash: string } {
  const serverSeed = randomBytes(32).toString("hex");
  const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");
  return { serverSeed, serverSeedHash };
}

export function buildFinalSeed(
  serverSeed: string,
  clientSeed: string | null | undefined,
  nonce: number
): string {
  const input = `${serverSeed}|${clientSeed ?? ""}|${nonce}`;
  return createHash("sha256").update(input).digest("hex");
}

export function verifyCommitment(serverSeed: string, serverSeedHash: string): boolean {
  const expected = createHash("sha256").update(serverSeed).digest("hex");
  return expected === serverSeedHash;
}
