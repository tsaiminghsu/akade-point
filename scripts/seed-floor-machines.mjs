/**
 * One-off: creates "一樓" / "二樓" machine groups under 台中大遠百店 (store-2)
 * and populates them with claw machines — 20 on 一樓, 30 on 二樓.
 *
 * Looks the store up by name (falls back to id "store-2") and is safe to
 * re-run: it reuses existing 一樓/二樓 groups instead of duplicating them,
 * and only ever appends new machines under those groups.
 *
 * Run:
 *   node scripts/seed-floor-machines.mjs
 *
 * Requires AWS credentials (CLI profile or env vars) — same as
 * scripts/create-tables.mjs.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "ap-northeast-1" });
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const STORES_TABLE = "akade-cc-stores";
const GROUPS_TABLE = "akade-cc-groups";
const MACHINES_TABLE = "akade-cc-machines";

const STORE_NAME = "台中大遠百店";
const STORE_ID_FALLBACK = "store-2";

const FLOORS = [
  { name: "一樓", count: 20, deviceCodePrefix: "DEV-2F1" },
  { name: "二樓", count: 30, deviceCodePrefix: "DEV-2F2" },
];
const MACHINE_NAME_PREFIX = "夾娃娃機";

async function findStore() {
  const res = await ddb.send(new ScanCommand({ TableName: STORES_TABLE }));
  const stores = res.Items ?? [];
  return stores.find((s) => s.name === STORE_NAME) ?? stores.find((s) => s.id === STORE_ID_FALLBACK) ?? null;
}

async function listGroupsForStore(storeId) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: GROUPS_TABLE,
      IndexName: "store-index",
      KeyConditionExpression: "storeId = :sid",
      ExpressionAttributeValues: { ":sid": storeId },
    })
  );
  return res.Items ?? [];
}

async function ensureGroup(storeId, name, existingGroups) {
  const existing = existingGroups.find((g) => g.name === name);
  if (existing) return existing;
  const group = { id: createId(), name, storeId };
  await ddb.send(new PutCommand({ TableName: GROUPS_TABLE, Item: group }));
  console.log(`  + created group "${name}" (${group.id})`);
  return group;
}

async function createMachine({ name, deviceId, storeId, groupId }) {
  const now = Date.now();
  const machine = {
    id: createId(),
    name,
    deviceId,
    storeId,
    groupId,
    status: "online",
    current: 3,
    door: "closed",
    doorOpenSince: null,
    heartbeatAt: now,
    rssi: -50,
    firmware: "v2.5.0",
    restartCount: 0,
    lastUpdate: now,
    currentHistory: [{ t: now, value: 3 }],
  };
  await ddb.send(new PutCommand({ TableName: MACHINES_TABLE, Item: machine }));
  return machine;
}

const store = await findStore();
if (!store) {
  console.error(`Could not find store "${STORE_NAME}" (or id "${STORE_ID_FALLBACK}") in ${STORES_TABLE}.`);
  process.exit(1);
}
console.log(`Store: ${store.name} (${store.id})`);

const existingGroups = await listGroupsForStore(store.id);

for (const floor of FLOORS) {
  const group = await ensureGroup(store.id, floor.name, existingGroups);
  console.log(`Creating ${floor.count} machine(s) in "${floor.name}"...`);
  for (let i = 1; i <= floor.count; i++) {
    const name = `${MACHINE_NAME_PREFIX} #${i}`;
    const deviceId = `${floor.deviceCodePrefix}${String(1000 + i).padStart(4, "0")}`;
    await createMachine({ name, deviceId, storeId: store.id, groupId: group.id });
  }
  console.log(`  ✓ ${floor.count} machine(s) created in "${floor.name}"`);
}

console.log("Done.");
