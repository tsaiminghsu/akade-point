/**
 * Run once to create every DynamoDB table this app needs:
 *   akade-auth and akade-users (shared with the Akade Point app — creating
 *   them here is idempotent) plus the fourteen akade-cc-* tables.
 *
 * Usage:
 *   node scripts/create-tables.mjs
 *
 * Requires AWS credentials (CLI profile or env vars). To target a local
 * DynamoDB engine instead (see scripts/start-dynamodb-local.mjs), set
 * DYNAMODB_LOCAL_ENDPOINT before running, e.g.:
 *   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/create-tables.mjs
 */
import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const localEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  ...(localEndpoint && {
    endpoint: localEndpoint,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  }),
});

async function createTable(params) {
  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✓ Created: ${params.TableName}`);
  } catch (e) {
    if (e.name === "ResourceInUseException") {
      console.log(`— Already exists: ${params.TableName}`);
    } else {
      throw e;
    }
  }
}

/**
 * Turns on DynamoDB TTL for an append-only table. Idempotent: safe to re-run
 * (DynamoDB only allows one TTL change per table per hour, so re-running must
 * not attempt a redundant update).
 *
 * Note: DynamoDB Local accepts this call and reports TTL as enabled, but never
 * actually deletes expired items — local dev keeps its whole history.
 */
async function enableTtl(TableName, AttributeName) {
  try {
    // A freshly created table is still CREATING; UpdateTimeToLive needs ACTIVE.
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName });

    const current = await client.send(new DescribeTimeToLiveCommand({ TableName }));
    const desc = current.TimeToLiveDescription ?? {};
    if (desc.TimeToLiveStatus === "ENABLED" || desc.TimeToLiveStatus === "ENABLING") {
      if (desc.AttributeName === AttributeName) {
        console.log(`— TTL already enabled: ${TableName} (${AttributeName})`);
      } else {
        console.warn(
          `! TTL on ${TableName} uses "${desc.AttributeName}", not "${AttributeName}" — leaving it alone.`
        );
      }
      return;
    }

    await client.send(
      new UpdateTimeToLiveCommand({ TableName, TimeToLiveSpecification: { AttributeName, Enabled: true } })
    );
    console.log(`✓ TTL enabled: ${TableName} (${AttributeName})`);
  } catch (e) {
    // Concurrent runs can race into "TTL is already enabled".
    if (e.name === "ValidationException" && /already enabled/i.test(e.message ?? "")) {
      console.log(`— TTL already enabled: ${TableName}`);
      return;
    }
    throw e;
  }
}

// 1. akade-auth (NextAuth DynamoDB adapter)
await createTable({
  TableName: "akade-auth",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "pk", AttributeType: "S" },
    { AttributeName: "sk", AttributeType: "S" },
    { AttributeName: "GSI1PK", AttributeType: "S" },
    { AttributeName: "GSI1SK", AttributeType: "S" },
  ],
  KeySchema: [
    { AttributeName: "pk", KeyType: "HASH" },
    { AttributeName: "sk", KeyType: "RANGE" },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: "GSI1",
      KeySchema: [
        { AttributeName: "GSI1PK", KeyType: "HASH" },
        { AttributeName: "GSI1SK", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
  TimeToLiveSpecification: { AttributeName: "expires", Enabled: true },
});

// 2. akade-users
await createTable({
  TableName: "akade-users",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "userId", AttributeType: "S" },
    { AttributeName: "entityType", AttributeType: "S" },
    { AttributeName: "totalPoints", AttributeType: "N" },
  ],
  KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "leaderboard-index",
      KeySchema: [
        { AttributeName: "entityType", KeyType: "HASH" },
        { AttributeName: "totalPoints", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 3. akade-cc-brands
await createTable({
  TableName: "akade-cc-brands",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
});

// 4. akade-cc-stores
await createTable({
  TableName: "akade-cc-stores",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "brandId", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "brand-index",
      KeySchema: [{ AttributeName: "brandId", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 5. akade-cc-groups
await createTable({
  TableName: "akade-cc-groups",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "storeId", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "store-index",
      KeySchema: [{ AttributeName: "storeId", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 6. akade-cc-machines
await createTable({
  TableName: "akade-cc-machines",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "storeId", AttributeType: "S" },
    { AttributeName: "groupId", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "store-group-index",
      KeySchema: [
        { AttributeName: "storeId", KeyType: "HASH" },
        { AttributeName: "groupId", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 7. akade-cc-machine-events
await createTable({
  TableName: "akade-cc-machine-events",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "machineId", AttributeType: "S" },
    { AttributeName: "storeId", AttributeType: "S" },
    { AttributeName: "timestamp", AttributeType: "N" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "machine-index",
      KeySchema: [
        { AttributeName: "machineId", KeyType: "HASH" },
        { AttributeName: "timestamp", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
    {
      IndexName: "store-index",
      KeySchema: [
        { AttributeName: "storeId", KeyType: "HASH" },
        { AttributeName: "timestamp", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 8. akade-cc-alerts
await createTable({
  TableName: "akade-cc-alerts",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "machineId", AttributeType: "S" },
    { AttributeName: "storeId", AttributeType: "S" },
    { AttributeName: "createdAt", AttributeType: "N" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "machine-index",
      KeySchema: [
        { AttributeName: "machineId", KeyType: "HASH" },
        { AttributeName: "createdAt", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
    {
      IndexName: "store-index",
      KeySchema: [
        { AttributeName: "storeId", KeyType: "HASH" },
        { AttributeName: "createdAt", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 9. akade-cc-maintenance-records
await createTable({
  TableName: "akade-cc-maintenance-records",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "machineId", AttributeType: "S" },
    { AttributeName: "date", AttributeType: "N" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "machine-index",
      KeySchema: [
        { AttributeName: "machineId", KeyType: "HASH" },
        { AttributeName: "date", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 10. akade-cc-store-settings
await createTable({
  TableName: "akade-cc-store-settings",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [{ AttributeName: "storeId", AttributeType: "S" }],
  KeySchema: [{ AttributeName: "storeId", KeyType: "HASH" }],
});

// 11. akade-cc-layout-versions
await createTable({
  TableName: "akade-cc-layout-versions",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "storeId", AttributeType: "S" },
    { AttributeName: "id", AttributeType: "S" },
  ],
  KeySchema: [
    { AttributeName: "storeId", KeyType: "HASH" },
    { AttributeName: "id", KeyType: "RANGE" },
  ],
});

// 12. akade-cc-vehicles
await createTable({
  TableName: "akade-cc-vehicles",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "companionId", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "companion-index",
      KeySchema: [{ AttributeName: "companionId", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 13. akade-cc-vehicle-tokens
await createTable({
  TableName: "akade-cc-vehicle-tokens",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "tokenId", AttributeType: "S" },
    { AttributeName: "vehicleId", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "tokenId", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "vehicle-index",
      KeySchema: [{ AttributeName: "vehicleId", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 14. akade-cc-vehicle-commands
await createTable({
  TableName: "akade-cc-vehicle-commands",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "vehicleId", AttributeType: "S" },
    { AttributeName: "createdAt", AttributeType: "N" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "vehicle-index",
      KeySchema: [
        { AttributeName: "vehicleId", KeyType: "HASH" },
        { AttributeName: "createdAt", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 15. akade-cc-vehicle-telemetry (history; live state lives on the vehicle row)
await createTable({
  TableName: "akade-cc-vehicle-telemetry",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "vehicleId", AttributeType: "S" },
    { AttributeName: "t", AttributeType: "N" },
  ],
  KeySchema: [
    { AttributeName: "vehicleId", KeyType: "HASH" },
    { AttributeName: "t", KeyType: "RANGE" },
  ],
});

// 16. akade-cc-vehicle-missions
await createTable({
  TableName: "akade-cc-vehicle-missions",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "vehicleId", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "vehicle-index",
      KeySchema: [{ AttributeName: "vehicleId", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// Live Mode appends telemetry every second, so these tables need an expiry or
// every list request gets permanently slower. See lib/dynamo/ttl.ts for the
// horizons that stamp the expiresAt attribute. Vehicle telemetry (7 d) and the
// command log (30 d) get the same treatment.
await enableTtl("akade-cc-machine-events", "expiresAt");
await enableTtl("akade-cc-alerts", "expiresAt");
await enableTtl("akade-cc-vehicle-telemetry", "expiresAt");
await enableTtl("akade-cc-vehicle-commands", "expiresAt");

console.log("\n✅ All tables ready.");
