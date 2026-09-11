/**
 * One-off migration: seed DynamoDB from the local file-storage JSON dump
 * that used to back the Control Center's Zustand stores
 * (data/control-center/*.json), now that persistence has moved to DynamoDB
 * via app/api/control-center/*.
 *
 * Run once, after `node scripts/create-tables.mjs`:
 *   node scripts/migrate-cc-file-to-dynamo.mjs
 *
 * Requires AWS credentials (CLI profile or env vars).
 */
import { readFile } from "fs/promises";
import path from "path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "ap-northeast-1" });
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const DATA_DIR = path.join(process.cwd(), "data", "control-center");

async function readJsonState(name) {
  try {
    const raw = await readFile(path.join(DATA_DIR, `${name}.json`), "utf-8");
    return JSON.parse(raw).state;
  } catch {
    return null;
  }
}

async function putAll(tableName, items) {
  for (const item of items) {
    await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  }
  console.log(`✓ Migrated ${items.length} item(s) into ${tableName}`);
}

const directory = await readJsonState("cc-machines-directory");
if (directory) {
  await putAll("akade-cc-brands", directory.brands ?? []);
  // Older dumps predate the activeLayoutVersionId field on stores.
  await putAll(
    "akade-cc-stores",
    (directory.stores ?? []).map((s) => ({ activeLayoutVersionId: null, ...s }))
  );
  await putAll("akade-cc-groups", directory.groups ?? []);
  await putAll("akade-cc-machines", directory.machines ?? []);
} else {
  console.log("— No cc-machines-directory.json found, nothing to migrate for brands/stores/groups/machines");
}

const settings = await readJsonState("cc-store-settings");
if (settings?.settingsByStore) {
  const rows = Object.entries(settings.settingsByStore).map(([storeId, s]) => ({ storeId, ...s }));
  await putAll("akade-cc-store-settings", rows);
} else {
  console.log("— No cc-store-settings.json found, nothing to migrate for store settings");
}

const versions = await readJsonState("cc-layout-versions");
if (versions?.versionsByStore) {
  const rows = Object.entries(versions.versionsByStore).flatMap(([storeId, list]) =>
    (list ?? []).map((v) => ({ storeId, ...v }))
  );
  await putAll("akade-cc-layout-versions", rows);
} else {
  console.log("— No cc-layout-versions.json found, nothing to migrate for layout versions");
}

console.log("Done.");
