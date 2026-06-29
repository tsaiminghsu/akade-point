import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";
import { GetCommand, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamo/client";
import { normalizeKBStore } from "@/lib/maintenance/knowledgeBaseDefaults";
import type { KnowledgeBaseStore } from "@/lib/maintenance/knowledgeBaseTypes";

const KB_PK = "GAME_KB";
const MANIFEST_SK = "DATA";
const CHUNK_PREFIX = "CHUNK#";
const MAX_CHUNK_BYTES = 320_000; // 320KB per DynamoDB item (400KB limit)

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const userId = (session.user as { id: string }).id;
  const user = await getUser(userId);
  return user?.isAdmin ? user : null;
}

interface ManifestItem {
  PK: string;
  SK: string;
  chunkCount: number;
  updatedAt: string;
}

async function readKBFromDynamo(): Promise<KnowledgeBaseStore | null> {
  try {
    // Read manifest
    const manifest = await ddb.send(new GetCommand({
      TableName: TABLES.AUTH,
      Key: { PK: KB_PK, SK: MANIFEST_SK },
    }));

    const item = manifest.Item as ManifestItem | undefined;
    if (!item?.chunkCount) return null;

    // Read all chunks
    const chunkCount = item.chunkCount;
    const chunks: string[] = [];
    for (let i = 1; i <= chunkCount; i++) {
      const sk = `${CHUNK_PREFIX}${String(i).padStart(5, "0")}`;
      const chunkRes = await ddb.send(new GetCommand({
        TableName: TABLES.AUTH,
        Key: { PK: KB_PK, SK: sk },
      }));
      const chunkItem = chunkRes.Item as { data?: string } | undefined;
      if (!chunkItem?.data) return null;
      chunks.push(chunkItem.data);
    }

    const json = chunks.join("");
    return normalizeKBStore(JSON.parse(json) as Partial<KnowledgeBaseStore>);
  } catch (error) {
    console.error("[knowledge-base] failed to read from DynamoDB", error);
    return null;
  }
}

async function writeKBToDynamo(store: KnowledgeBaseStore): Promise<void> {
  const json = JSON.stringify(store);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);

  // Split into chunks
  const chunkCount = Math.ceil(bytes.length / MAX_CHUNK_BYTES);
  const chunkSize = Math.ceil(json.length / chunkCount);
  const chunks: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    chunks.push(json.slice(i * chunkSize, (i + 1) * chunkSize));
  }

  // Delete old chunks that may be stale (query existing chunks)
  const existing = await ddb.send(new QueryCommand({
    TableName: TABLES.AUTH,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": KB_PK, ":prefix": CHUNK_PREFIX },
    ProjectionExpression: "SK",
  }));

  const oldSKs = (existing.Items || []).map((i) => (i as { SK: string }).SK);
  const newSKs = chunks.map((_, idx) => `${CHUNK_PREFIX}${String(idx + 1).padStart(5, "0")}`);
  const toDelete = oldSKs.filter((sk) => !newSKs.includes(sk));

  for (const sk of toDelete) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.AUTH, Key: { PK: KB_PK, SK: sk } }));
  }

  // Write new chunks
  for (let i = 0; i < chunks.length; i++) {
    const sk = `${CHUNK_PREFIX}${String(i + 1).padStart(5, "0")}`;
    await ddb.send(new PutCommand({
      TableName: TABLES.AUTH,
      Item: { PK: KB_PK, SK: sk, data: chunks[i] },
    }));
  }

  // Write manifest last
  await ddb.send(new PutCommand({
    TableName: TABLES.AUTH,
    Item: { PK: KB_PK, SK: MANIFEST_SK, chunkCount: chunks.length, updatedAt: new Date().toISOString() },
  }));
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = await readKBFromDynamo();
  return NextResponse.json({ store: store ?? normalizeKBStore({}) });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { store?: unknown };
    if (!body.store || typeof body.store !== "object") {
      return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
    }

    const store = normalizeKBStore(body.store as Partial<KnowledgeBaseStore>);
    await writeKBToDynamo(store);
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "儲存失敗" },
      { status: 500 }
    );
  }
}
