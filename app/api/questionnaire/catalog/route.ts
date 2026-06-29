import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamo/client";

const CATALOG_PK = "APP_CONFIG";
const CATALOG_SK = "questionnaire-maintenance";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const userId = (session.user as { id: string }).id;
  const user = await getUser(userId);
  return user?.isAdmin ? user : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLES.AUTH,
      Key: { PK: CATALOG_PK, SK: CATALOG_SK },
    }));
    return NextResponse.json({ catalog: result.Item?.catalog ?? null });
  } catch {
    return NextResponse.json({ catalog: null });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { catalog?: unknown };
    await ddb.send(new PutCommand({
      TableName: TABLES.AUTH,
      Item: {
        PK: CATALOG_PK,
        SK: CATALOG_SK,
        catalog: body.catalog,
        updatedAt: new Date().toISOString(),
      },
    }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "儲存失敗" },
      { status: 500 }
    );
  }
}
