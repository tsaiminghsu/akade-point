/**
 * Run once to create all DynamoDB tables:
 *   node scripts/create-tables.mjs
 *
 * Requires AWS credentials (CLI profile or env vars).
 */
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "ap-northeast-1" });

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

// 3. akade-cards
await createTable({
  TableName: "akade-cards",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "qrToken", AttributeType: "S" },
    { AttributeName: "serialNumber", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "qrToken", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "serial-index",
      KeySchema: [{ AttributeName: "serialNumber", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 4. akade-registrations
await createTable({
  TableName: "akade-registrations",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "userId", AttributeType: "S" },
    { AttributeName: "registrationId", AttributeType: "S" },
    { AttributeName: "qrToken", AttributeType: "S" },
  ],
  KeySchema: [
    { AttributeName: "userId", KeyType: "HASH" },
    { AttributeName: "registrationId", KeyType: "RANGE" },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: "qrtoken-index",
      KeySchema: [{ AttributeName: "qrToken", KeyType: "HASH" }],
      Projection: { ProjectionType: "KEYS_ONLY" },
    },
  ],
});

// 5. akade-sessions
await createTable({
  TableName: "akade-sessions",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "sessionId", AttributeType: "S" },
    { AttributeName: "userId", AttributeType: "S" },
    { AttributeName: "createdAt", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "sessionId", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "user-sessions-index",
      KeySchema: [
        { AttributeName: "userId", KeyType: "HASH" },
        { AttributeName: "createdAt", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// 6. akade-shops
await createTable({
  TableName: "akade-shops",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [{ AttributeName: "shopCode", AttributeType: "S" }],
  KeySchema: [{ AttributeName: "shopCode", KeyType: "HASH" }],
});

// 7. akade-rewards
await createTable({
  TableName: "akade-rewards",
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "userId", AttributeType: "S" },
    { AttributeName: "tier", AttributeType: "S" },
  ],
  KeySchema: [
    { AttributeName: "userId", KeyType: "HASH" },
    { AttributeName: "tier", KeyType: "RANGE" },
  ],
});

console.log("\n✅ All tables ready.");
