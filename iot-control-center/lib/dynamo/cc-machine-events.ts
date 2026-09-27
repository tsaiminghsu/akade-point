import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { chunk } from "@/lib/control-center/batch";
import { batchPutAll } from "./batch";
import { ddb, TABLES } from "./client";
import { listStores } from "./cc-stores";
import { mergeRecent } from "./recent";
import { EVENT_TTL_SECONDS, expiresAtFrom } from "./ttl";

export type CCEventSeverity = "info" | "warning" | "critical";

export interface CCMachineEvent {
  id: string;
  machineId: string;
  storeId: string;
  type: string;
  message: string;
  severity: CCEventSeverity;
  timestamp: number; // epoch ms
  /** DynamoDB TTL, epoch seconds. Optional: rows written before TTL existed
   *  have no value and are never auto-expired. */
  expiresAt?: number;
}

export type CCMachineEventInput = Omit<CCMachineEvent, "id" | "expiresAt">;

/** How many stores to Query concurrently when merging a cross-store window. */
const STORE_FANOUT_CONCURRENCY = 10;

export interface RecentOpts {
  limit: number;
  /** Exclusive upper bound on `timestamp` (epoch ms), for paging backwards. */
  before?: number;
}

function toEventItem(data: CCMachineEventInput): CCMachineEvent {
  return { id: createId(), ...data, expiresAt: expiresAtFrom(data.timestamp, EVENT_TTL_SECONDS) };
}

export async function createEvent(data: CCMachineEventInput): Promise<CCMachineEvent> {
  const event = toEventItem(data);
  await ddb.send(new PutCommand({ TableName: TABLES.CC_MACHINE_EVENTS, Item: event }));
  return event;
}

/** Writes many events in as few round trips as DynamoDB allows. Returns the
 *  created records **in input order**, so a caller can map its own temporary
 *  ids onto the server-assigned ones by index. */
export async function createEvents(data: CCMachineEventInput[]): Promise<CCMachineEvent[]> {
  if (data.length === 0) return [];
  const events = data.map(toEventItem);
  await batchPutAll(TABLES.CC_MACHINE_EVENTS, events as unknown as Record<string, unknown>[]);
  return events;
}

async function queryEvents(
  indexName: "machine-index" | "store-index",
  keyName: "machineId" | "storeId",
  keyValue: string,
  opts: RecentOpts
): Promise<CCMachineEvent[]> {
  // "timestamp" is a DynamoDB reserved word, so the range condition has to go
  // through an aliased name — and the alias may only be declared when used.
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_MACHINE_EVENTS,
      IndexName: indexName,
      KeyConditionExpression: `${keyName} = :k${opts.before === undefined ? "" : " AND #ts < :before"}`,
      ...(opts.before === undefined ? {} : { ExpressionAttributeNames: { "#ts": "timestamp" } }),
      ExpressionAttributeValues: {
        ":k": keyValue,
        ...(opts.before === undefined ? {} : { ":before": opts.before }),
      },
      ScanIndexForward: false,
      Limit: opts.limit,
    })
  );
  return (res.Items ?? []) as CCMachineEvent[];
}

export function listEventsByMachine(machineId: string, opts: RecentOpts): Promise<CCMachineEvent[]> {
  return queryEvents("machine-index", "machineId", machineId, opts);
}

export function listEventsByStore(storeId: string, opts: RecentOpts): Promise<CCMachineEvent[]> {
  return queryEvents("store-index", "storeId", storeId, opts);
}

/**
 * The newest `limit` events across every store, via the store-index GSI.
 *
 * This replaces a full-table Scan. The stores table is small, so fanning out one
 * bounded Query per store reads at most `stores × limit` small items instead of
 * the whole (ever-growing) events table. If the store count ever grows past a
 * few dozen, switch to a GSI with a constant partition key plus a timestamp
 * sort key — that costs a table update and a backfill, so it isn't worth it yet.
 */
export async function listRecentEvents(opts: RecentOpts): Promise<CCMachineEvent[]> {
  const stores = await listStores();
  const lists: CCMachineEvent[][] = [];
  for (const group of chunk(stores, STORE_FANOUT_CONCURRENCY)) {
    lists.push(...(await Promise.all(group.map((store) => listEventsByStore(store.id, opts)))));
  }
  return mergeRecent(lists, (e) => e.timestamp, opts.limit, (e) => e.id);
}
