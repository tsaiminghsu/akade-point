/**
 * One-off: seeds a small amount of demo data (brands/stores/groups/machines)
 * into the Control Center tables — for offline dev via DynamoDB Local, so
 * /iot-control-center isn't empty. Safe to re-run (checks for an existing
 * brand by name before creating).
 *
 * Run (after scripts/start-dynamodb-local.mjs and scripts/create-tables.mjs
 * have both been run against the same endpoint):
 *   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/seed-control-center-local.mjs
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";

const localEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
if (!localEndpoint) {
  console.error("Set DYNAMODB_LOCAL_ENDPOINT (e.g. http://localhost:8500) before running this script.");
  process.exit(1);
}

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  endpoint: localEndpoint,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const BRANDS_TABLE = "akade-cc-brands";
const STORES_TABLE = "akade-cc-stores";
const GROUPS_TABLE = "akade-cc-groups";
const MACHINES_TABLE = "akade-cc-machines";

async function put(table, item) {
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return item;
}

const existingBrands = (await ddb.send(new ScanCommand({ TableName: BRANDS_TABLE }))).Items ?? [];
if (existingBrands.length > 0) {
  console.log(`${BRANDS_TABLE} already has ${existingBrands.length} brand(s) — skipping seed.`);
  process.exit(0);
}

const brand = await put(BRANDS_TABLE, {
  id: createId(),
  name: "示範品牌",
  description: "Local dev demo brand",
  color: "#6366f1",
});
console.log(`+ brand "${brand.name}" (${brand.id})`);

const store = await put(STORES_TABLE, {
  id: createId(),
  name: "示範店",
  address: "測試地址 1 號",
  brandId: brand.id,
  activeLayoutVersionId: null,
});
console.log(`+ store "${store.name}" (${store.id})`);

const group = await put(GROUPS_TABLE, {
  id: createId(),
  name: "夾娃娃機區",
  storeId: store.id,
});
console.log(`+ group "${group.name}" (${group.id})`);

const statuses = ["online", "online", "online", "warning", "offline"];
for (let i = 1; i <= 5; i++) {
  const now = Date.now();
  const status = statuses[i - 1];
  const machine = await put(MACHINES_TABLE, {
    id: createId(),
    name: `夾娃娃機 #${i}`,
    deviceId: `DEV-LOCAL-${String(1000 + i).padStart(4, "0")}`,
    storeId: store.id,
    groupId: group.id,
    status,
    current: status === "warning" ? 9 : 3,
    door: "closed",
    doorOpenSince: null,
    heartbeatAt: now,
    rssi: -50,
    firmware: "v2.5.0",
    restartCount: 0,
    lastUpdate: now,
    currentHistory: [{ t: now, value: 3 }],
  });
  console.log(`  + machine "${machine.name}" (${machine.id})`);
}

console.log("Done.");
