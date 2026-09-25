import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

// Local dev only: when DYNAMODB_LOCAL_ENDPOINT is set (see scripts/start-dynamodb-local.mjs),
// talk to a local DynamoDB-compatible engine instead of real AWS — same wire
// protocol, so no query/update logic anywhere else has to change. Unset in
// production, so this never affects the deployed app.
const localEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  ...(localEndpoint && {
    endpoint: localEndpoint,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  }),
});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// AUTH and USERS are shared with the Akade Point app: both sign in the same
// LINE accounts against the same two tables, and isAdmin on akade-users is
// what gates this app (see app/iot-control-center/layout.tsx). The card,
// registration, shop and reward tables belong to that app alone and are not
// declared here.
export const TABLES = {
  AUTH: "akade-auth",
  USERS: "akade-users",

  CC_BRANDS: "akade-cc-brands",
  CC_STORES: "akade-cc-stores",
  CC_GROUPS: "akade-cc-groups",
  CC_MACHINES: "akade-cc-machines",
  CC_MACHINE_EVENTS: "akade-cc-machine-events",
  CC_ALERTS: "akade-cc-alerts",
  CC_MAINTENANCE_RECORDS: "akade-cc-maintenance-records",
  CC_STORE_SETTINGS: "akade-cc-store-settings",
  CC_LAYOUT_VERSIONS: "akade-cc-layout-versions",

  // Vehicles module (drones / rovers via MissionPlanner + companion boards).
  CC_VEHICLES: "akade-cc-vehicles",
  CC_VEHICLE_TOKENS: "akade-cc-vehicle-tokens",
  CC_VEHICLE_COMMANDS: "akade-cc-vehicle-commands",
  CC_VEHICLE_TELEMETRY: "akade-cc-vehicle-telemetry",
  CC_VEHICLE_MISSIONS: "akade-cc-vehicle-missions",
  CC_CLAW_CONFIGS: "akade-cc-claw-configs",
  CC_CLAW_SYNC: "akade-cc-claw-sync",
  CC_MACHINE_TOKENS: "akade-cc-machine-tokens",
} as const;

/**
 * Builds a SET-only UpdateExpression from a partial patch object, aliasing
 * every attribute name (via ExpressionAttributeNames) so patch keys that
 * happen to be DynamoDB reserved words (e.g. "name", "status") never break
 * the expression. `undefined` values are skipped (no accidental attribute
 * removal — callers use a dedicated remove/delete function for that).
 *
 * Returns `null` when nothing is left to write: an empty SET expression is a
 * DynamoDB ValidationException, so callers must skip the UpdateCommand entirely
 * rather than send `"SET "`.
 */
export function buildUpdateExpression(patch: Record<string, unknown>) {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  let i = 0;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const nameKey = `#k${i}`;
    const valueKey = `:v${i}`;
    names[nameKey] = key;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
    i += 1;
  }
  if (sets.length === 0) return null;
  return {
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

/** Scans an entire table across pages, following LastEvaluatedKey. */
export async function paginatedScan<T>(tableName: string): Promise<T[]> {
  const items: T[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: exclusiveStartKey })
    );
    items.push(...((res.Items ?? []) as T[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

/** True if a Query against `indexName` for `keyCondition`/`values` returns at
 *  least one item — used for "block delete while dependents exist" guards
 *  without pulling the full dependent result set. */
export async function hasAnyDependent(
  tableName: string,
  indexName: string,
  keyCondition: string,
  values: Record<string, unknown>
): Promise<boolean> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      Limit: 1,
    })
  );
  return (res.Count ?? 0) > 0;
}
