import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";
import { buildUpdateExpression, ddb, hasAnyDependent, paginatedScan, TABLES } from "./client";

export interface CCBrand {
  id: string;
  name: string;
  description: string;
  color: string;
}

export async function listBrands(): Promise<CCBrand[]> {
  return paginatedScan<CCBrand>(TABLES.CC_BRANDS);
}

export async function getBrand(id: string): Promise<CCBrand | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_BRANDS, Key: { id } }));
  return (res.Item as CCBrand) ?? null;
}

export async function createBrand(data: Omit<CCBrand, "id">): Promise<CCBrand> {
  const brand: CCBrand = { id: createId(), ...data };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_BRANDS, Item: brand }));
  return brand;
}

export async function updateBrand(id: string, patch: Partial<Omit<CCBrand, "id">>): Promise<void> {
  const update = buildUpdateExpression(patch);
  if (!update) return;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_BRANDS,
      Key: { id },
      ...update,
    })
  );
}

/** Blocks (returns false) if any store still references this brand. */
export async function deleteBrand(id: string): Promise<boolean> {
  const blocked = await hasAnyDependent(TABLES.CC_STORES, "brand-index", "brandId = :bid", { ":bid": id });
  if (blocked) return false;

  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_BRANDS, Key: { id } }));
  return true;
}
