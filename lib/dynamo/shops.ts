import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./client";

export interface Shop {
  shopCode: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: string;
}

export async function getShop(shopCode: string): Promise<Shop | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLES.SHOPS, Key: { shopCode } })
  );
  return (res.Item as Shop) ?? null;
}

export async function createShop(
  shopCode: string,
  name: string,
  location?: string
): Promise<Shop> {
  const shop: Shop = {
    shopCode,
    name,
    location,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLES.SHOPS, Item: shop }));
  return shop;
}

export async function listShops(): Promise<Shop[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.SHOPS }));
  return (res.Items ?? []) as Shop[];
}
