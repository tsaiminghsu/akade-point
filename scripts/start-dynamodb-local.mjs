/**
 * Starts AWS's official DynamoDB Local engine for offline dev — a real
 * DynamoDB-compatible server (same wire protocol as the real thing), no
 * Docker or AWS account needed, just a JRE.
 *
 * One-time setup (already done for this checkout — the jar lives in
 * .dynamodb-local/, gitignored): download & unzip
 *   https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.zip
 * into .dynamodb-local/ at the repo root.
 *
 * Run:
 *   node scripts/start-dynamodb-local.mjs
 * Then, in another terminal (once per fresh .dynamodb-local-data/):
 *   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/create-tables.mjs
 *   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/seed-control-center-local.mjs
 *
 * Data persists to .dynamodb-local-data/ (gitignored) across restarts.
 * Set DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 in .env.local so the
 * Next.js app itself talks to this instead of real AWS.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const jarDir = path.join(repoRoot, ".dynamodb-local");
const jarPath = path.join(jarDir, "DynamoDBLocal.jar");
const dataDir = path.join(repoRoot, ".dynamodb-local-data");
const port = process.env.DYNAMODB_LOCAL_PORT ?? "8500";

if (!existsSync(jarPath)) {
  console.error(`DynamoDBLocal.jar not found at ${jarPath}.`);
  console.error(
    "Download & unzip https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.zip into .dynamodb-local/ first."
  );
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });

console.log(`Starting DynamoDB Local on port ${port} (data: ${dataDir})...`);
const proc = spawn(
  "java",
  ["-Djava.library.path=./DynamoDBLocal_lib", "-jar", "DynamoDBLocal.jar", "-sharedDb", "-dbPath", dataDir, "-port", port],
  { cwd: jarDir, stdio: "inherit" }
);

proc.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => proc.kill("SIGINT"));
process.on("SIGTERM", () => proc.kill("SIGTERM"));
