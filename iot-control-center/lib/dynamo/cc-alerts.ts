import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { chunk } from "@/lib/control-center/batch";
import { batchPutAll } from "./batch";
import { ddb, TABLES } from "./client";
import type { CCEventSeverity, RecentOpts } from "./cc-machine-events";
import { listStores } from "./cc-stores";
import { mergeRecent } from "./recent";
import { ALERT_TTL_SECONDS, expiresAtFrom } from "./ttl";

export type CCAlertStatus = "active" | "acknowledged" | "resolved" | "ignored";

export interface CCAlert {
  id: string;
  machineId: string;
  storeId: string;
  type: string;
  message: string;
  severity: CCEventSeverity;
  status: CCAlertStatus;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  /** DynamoDB TTL, epoch seconds. Optional: rows written before TTL existed
   *  have no value and are never auto-expired. */
  expiresAt?: number;
}

export type CCAlertInput = Omit<CCAlert, "id" | "status" | "createdAt" | "updatedAt" | "expiresAt">;

/** How many stores to Query concurrently when merging a cross-store window. */
const STORE_FANOUT_CONCURRENCY = 10;

function toAlertItem(data: CCAlertInput, now: number): CCAlert {
  return {
    id: createId(),
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt: expiresAtFrom(now, ALERT_TTL_SECONDS),
    ...data,
  };
}

export async function createAlert(data: CCAlertInput): Promise<CCAlert> {
  const alert = toAlertItem(data, Date.now());
  await ddb.send(new PutCommand({ TableName: TABLES.CC_ALERTS, Item: alert }));
  return alert;
}

/** Writes many alerts in as few round trips as DynamoDB allows. Returns the
 *  created records **in input order** so callers can swap their local draft ids
 *  for the server-assigned ones by index. */
export async function createAlerts(data: CCAlertInput[]): Promise<CCAlert[]> {
  if (data.length === 0) return [];
  const now = Date.now();
  const alerts = data.map((item) => toAlertItem(item, now));
  await batchPutAll(TABLES.CC_ALERTS, alerts as unknown as Record<string, unknown>[]);
  return alerts;
}

async function queryAlerts(
  indexName: "machine-index" | "store-index",
  keyName: "machineId" | "storeId",
  keyValue: string,
  opts: RecentOpts
): Promise<CCAlert[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_ALERTS,
      IndexName: indexName,
      KeyConditionExpression: `${keyName} = :k${opts.before === undefined ? "" : " AND createdAt < :before"}`,
      ExpressionAttributeValues: {
        ":k": keyValue,
        ...(opts.before === undefined ? {} : { ":before": opts.before }),
      },
      ScanIndexForward: false,
      Limit: opts.limit,
    })
  );
  return (res.Items ?? []) as CCAlert[];
}

export function listAlertsByMachine(machineId: string, opts: RecentOpts): Promise<CCAlert[]> {
  return queryAlerts("machine-index", "machineId", machineId, opts);
}

export function listAlertsByStore(storeId: string, opts: RecentOpts): Promise<CCAlert[]> {
  return queryAlerts("store-index", "storeId", storeId, opts);
}

/** The newest `limit` alerts across every store, via the store-index GSI.
 *  See listRecentEvents for why this fans out per store instead of scanning. */
export async function listRecentAlerts(opts: RecentOpts): Promise<CCAlert[]> {
  const stores = await listStores();
  const lists: CCAlert[][] = [];
  for (const group of chunk(stores, STORE_FANOUT_CONCURRENCY)) {
    lists.push(...(await Promise.all(group.map((store) => listAlertsByStore(store.id, opts)))));
  }
  return mergeRecent(lists, (a) => a.createdAt, opts.limit, (a) => a.id);
}

export async function updateAlertStatus(id: string, status: CCAlertStatus): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_ALERTS,
      Key: { id },
      UpdateExpression: "SET #s = :s, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": status, ":now": Date.now() },
    })
  );
}
