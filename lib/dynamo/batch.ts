import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

import { chunk } from "@/lib/control-center/batch";
import { ddb } from "./client";

const MAX_BATCH_WRITE_ITEMS = 25; // DynamoDB hard limit per BatchWriteItem call.
const DEFAULT_MAX_ATTEMPTS = 5;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes every item with as few round trips as DynamoDB allows: 25 per
 * BatchWriteItem call, re-sending whatever comes back in `UnprocessedItems`
 * with exponential backoff. Replaces the per-item PutCommand loop that Live
 * Mode used to fire once per second per event.
 *
 * `sleep` is injectable so tests don't need fake timers.
 */
export async function batchPutAll(
  tableName: string,
  items: Record<string, unknown>[],
  opts: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = opts.sleep ?? defaultSleep;

  for (const group of chunk(items, MAX_BATCH_WRITE_ITEMS)) {
    let pending = group.map((Item) => ({ PutRequest: { Item } }));
    let attempt = 0;

    while (pending.length > 0) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [tableName]: pending } }));
      const unprocessed = (res.UnprocessedItems?.[tableName] ?? []) as typeof pending;
      if (unprocessed.length === 0) break;

      attempt += 1;
      if (attempt >= maxAttempts) {
        throw new Error(
          `batchPutAll: ${unprocessed.length} unprocessed item(s) for ${tableName} after ${attempt} attempt(s)`
        );
      }
      pending = unprocessed;
      await sleep(Math.min(1000, 50 * 2 ** attempt) + Math.floor(Math.random() * 50));
    }
  }
}
