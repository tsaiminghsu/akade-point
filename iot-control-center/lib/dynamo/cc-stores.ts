import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { chunk } from "@/lib/control-center/batch";
import { buildUpdateExpression, ddb, hasAnyDependent, paginatedScan, TABLES } from "./client";

export interface CCStore {
  id: string;
  name: string;
  address: string;
  brandId: string;
  activeLayoutVersionId: string | null;
}

export async function listStores(): Promise<CCStore[]> {
  return paginatedScan<CCStore>(TABLES.CC_STORES);
}

export async function listStoresByBrand(brandId: string): Promise<CCStore[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_STORES,
      IndexName: "brand-index",
      KeyConditionExpression: "brandId = :bid",
      ExpressionAttributeValues: { ":bid": brandId },
    })
  );
  return (res.Items ?? []) as CCStore[];
}

export async function getStore(id: string): Promise<CCStore | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_STORES, Key: { id } }));
  return (res.Item as CCStore) ?? null;
}

export async function createStore(data: { name: string; address: string; brandId: string }): Promise<CCStore> {
  const store: CCStore = { id: createId(), activeLayoutVersionId: null, ...data };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_STORES, Item: store }));
  return store;
}

export async function updateStore(id: string, patch: Partial<Omit<CCStore, "id">>): Promise<void> {
  const update = buildUpdateExpression(patch);
  if (!update) return;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_STORES,
      Key: { id },
      ...update,
    })
  );
}

export async function setActiveLayoutVersion(storeId: string, versionId: string): Promise<void> {
  await updateStore(storeId, { activeLayoutVersionId: versionId });
}

/**
 * Blocks (returns false) if any machine still belongs to this store.
 * Otherwise cascades: deletes the store's own (now machine-less) groups,
 * its settings row, and all its layout versions, then the store itself.
 *
 * Not atomic: this is a sequence of separate Query/BatchWrite/Delete calls,
 * not a TransactWriteItems. A failure partway through (e.g. after groups are
 * deleted but before the store row is) can leave a partially-deleted store.
 * Full cross-table atomicity for an unbounded-size cascade is out of scope
 * for this prototype; revisit with an outbox/step-function if this needs to
 * be bulletproof.
 */
export async function deleteStore(id: string): Promise<boolean> {
  const blocked = await hasAnyDependent(TABLES.CC_MACHINES, "store-group-index", "storeId = :sid", { ":sid": id });
  if (blocked) return false;

  const groupsRes = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_GROUPS,
      IndexName: "store-index",
      KeyConditionExpression: "storeId = :sid",
      ExpressionAttributeValues: { ":sid": id },
    })
  );
  const groups = groupsRes.Items ?? [];

  const versionsRes = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_LAYOUT_VERSIONS,
      KeyConditionExpression: "storeId = :sid",
      ExpressionAttributeValues: { ":sid": id },
    })
  );
  const versions = versionsRes.Items ?? [];

  // BatchWriteItem caps at 25 requests per call, per table.
  const groupChunks = chunk(
    groups.map((g) => ({ DeleteRequest: { Key: { id: g.id } } })),
    25
  );
  for (const c of groupChunks) {
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLES.CC_GROUPS]: c } }));
  }
  const versionChunks = chunk(
    versions.map((v) => ({ DeleteRequest: { Key: { storeId: v.storeId, id: v.id } } })),
    25
  );
  for (const c of versionChunks) {
    await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLES.CC_LAYOUT_VERSIONS]: c } }));
  }

  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_STORE_SETTINGS, Key: { storeId: id } }));
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_STORES, Key: { id } }));
  return true;
}

