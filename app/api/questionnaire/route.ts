import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamo/client";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: "請先登入" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  try {
    const body = await request.json();
    const { mode, submittedAt, ...answers } = body as {
      mode: string;
      submittedAt: string;
      [key: string]: unknown;
    };

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId },
        UpdateExpression: "SET questionnaireData = :data, questionnaireUpdatedAt = :ts",
        ExpressionAttributeValues: {
          ":data": { mode, answers, submittedAt },
          ":ts": submittedAt || new Date().toISOString(),
        },
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[questionnaire] failed to save", error);
    return NextResponse.json({ message: "儲存失敗，請稍後再試" }, { status: 500 });
  }
}
