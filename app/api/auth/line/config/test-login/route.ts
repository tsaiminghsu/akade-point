import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";

export const runtime = "nodejs";

const NEXTAUTH_CALLBACK_PATH = "/api/auth/callback/line";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const user = await getUser(userId);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = (await request.json().catch(() => ({}))) as {
      channelId?: string;
      channelSecret?: string;
      redirectUri?: string;
    };

    const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
    const channelSecret = typeof body.channelSecret === "string" ? body.channelSecret.trim() : "";
    const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";

    const errors: string[] = [];
    if (!channelId) errors.push("Channel ID 不可空白");
    if (!channelSecret) errors.push("Channel Secret 不可空白");
    if (channelId && !/^\d+$/.test(channelId)) errors.push("Channel ID 格式不正確（應為純數字）");
    if (redirectUri && !redirectUri.includes(NEXTAUTH_CALLBACK_PATH)) {
      errors.push(`Callback URL 應包含 ${NEXTAUTH_CALLBACK_PATH}`);
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: errors.join("；"),
        errorCode: "VALIDATION_FAILED",
        errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "LINE Login 格式驗證通過",
      channelId,
      callbackPath: NEXTAUTH_CALLBACK_PATH,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: detail, errorCode: "UNEXPECTED_ERROR" },
      { status: 500 }
    );
  }
}
