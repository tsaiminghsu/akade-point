/**
 * One-off: grants isAdmin: true to a user record in akade-users, so they can
 * access /admin and /iot-control-center. There's no in-app way to grant the
 * *first* admin (the admin API itself requires already being an admin), so
 * this has to be run directly against DynamoDB.
 *
 * Usage: log in once via LINE at /login first (so your user record exists),
 * then run:
 *   node scripts/set-admin.mjs <email-or-userId>
 *
 * Requires AWS credentials (CLI profile or env vars) — same as
 * scripts/create-tables.mjs.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "ap-northeast-1" });
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const USERS_TABLE = "akade-users";

const identifier = process.argv[2];
if (!identifier) {
  console.error("Usage: node scripts/set-admin.mjs <email-or-userId>");
  process.exit(1);
}

async function findUser(identifier) {
  const res = await ddb.send(new ScanCommand({ TableName: USERS_TABLE }));
  const users = res.Items ?? [];
  return users.find((u) => u.userId === identifier || u.email === identifier) ?? null;
}

const user = await findUser(identifier);
if (!user) {
  console.error(`No user found matching "${identifier}" in ${USERS_TABLE}.`);
  console.error("Make sure you've logged in via LINE at /login at least once first.");
  process.exit(1);
}

if (user.isAdmin) {
  console.log(`${user.displayName ?? user.userId} (${user.userId}) is already an admin.`);
  process.exit(0);
}

await ddb.send(
  new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId: user.userId },
    UpdateExpression: "SET isAdmin = :a",
    ExpressionAttributeValues: { ":a": true },
  })
);

console.log(`Granted admin to ${user.displayName ?? user.userId} (${user.userId}).`);
