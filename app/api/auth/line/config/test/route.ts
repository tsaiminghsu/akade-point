import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";
import { getLineAuthRuntimeConfig } from "@/lib/auth/lineRuntimeConfig";
import { resolveRequestOrigin } from "@/lib/auth/requestOrigin";

export const runtime = "nodejs";

class LineTestError extends Error {
  status: number;
  errorCode: string;
  hint?: string;

  constructor(message: string, options?: { status?: number; errorCode?: string; hint?: string }) {
    super(message);
    this.name = "LineTestError";
    this.status = options?.status ?? 500;
    this.errorCode = options?.errorCode ?? "LINE_TEST_FAILED";
    this.hint = options?.hint;
  }
}

interface LineBotInfoResponse {
  userId: string;
  basicId?: string;
  displayName?: string;
  pictureUrl?: string;
}

interface ChannelAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getChannelAccessToken(channelId: string, channelSecret: string) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: channelId,
    client_secret: channelSecret,
  });

  const tokenRes = await fetch("https://api.line.me/v2/oauth/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    if (tokenRes.status === 400) {
      throw new LineTestError("LINE Channel ID / Channel Secret 驗證失敗", {
        status: 400,
        errorCode: "INVALID_CHANNEL_CREDENTIALS",
        hint: "請確認這組憑證是 Messaging API Channel 的 Channel ID 與 Channel Secret。",
      });
    }
    throw new LineTestError(`取得 LINE OA access token 失敗 (${tokenRes.status})`, {
      status: 502,
      errorCode: "OA_TOKEN_REQUEST_FAILED",
      hint: detail || "請稍後再試，或檢查 LINE 平台服務狀態。",
    });
  }

  return (await tokenRes.json()) as ChannelAccessTokenResponse;
}

async function getLineBotInfo(accessToken: string) {
  const botRes = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!botRes.ok) {
    const detail = await botRes.text();
    if (botRes.status === 403) {
      throw new LineTestError("目前這組憑證無法存取 LINE OA 資訊（403）", {
        status: 403,
        errorCode: "OA_API_FORBIDDEN",
        hint: "此組憑證可能是 LINE Login Channel，或尚未開通 Messaging API。",
      });
    }
    throw new LineTestError(`取得 LINE OA 資訊失敗 (${botRes.status})`, {
      status: 502,
      errorCode: "OA_INFO_REQUEST_FAILED",
      hint: detail || "請確認 Official Account 與 Messaging API 設定。",
    });
  }

  return (await botRes.json()) as LineBotInfoResponse;
}

async function revokeChannelAccessToken(accessToken: string) {
  const body = new URLSearchParams({ access_token: accessToken });
  try {
    await fetch("https://api.line.me/v2/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    // best-effort cleanup
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const user = await getUser(userId);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const origin = resolveRequestOrigin(request);
    const body = (await request.json().catch(() => ({}))) as {
      configId?: string;
      configName?: string;
      channelId?: string;
      channelSecret?: string;
    };

    const runtimeConfig = await getLineAuthRuntimeConfig(origin);
    const selectedConfigId =
      typeof body.configId === "string" && body.configId
        ? body.configId
        : runtimeConfig.activeConfigId;

    const selectedConfig =
      runtimeConfig.messagingApiConfigs?.find((item) => item.id === selectedConfigId) ||
      runtimeConfig.messagingApiConfigs?.[0];

    const channelId = typeof body.channelId === "string" ? body.channelId.trim() : selectedConfig?.channelId?.trim() || "";
    const channelSecret = typeof body.channelSecret === "string" ? body.channelSecret.trim() : selectedConfig?.channelSecret?.trim() || "";
    const configName = (typeof body.configName === "string" && body.configName.trim()) || selectedConfig?.name || "未命名設定卡";
    const configId = selectedConfig?.id || (typeof body.configId === "string" ? body.configId : null);

    if (!channelId || !channelSecret) {
      return NextResponse.json(
        { success: false, error: "請先完成 Channel ID 與 Channel Secret", errorCode: "MISSING_CHANNEL_FIELDS" },
        { status: 400 }
      );
    }

    const token = await getChannelAccessToken(channelId, channelSecret);
    const botInfo = await getLineBotInfo(token.access_token);
    await revokeChannelAccessToken(token.access_token);

    return NextResponse.json({
      success: true,
      message: "LINE OA 串接測試成功",
      configId,
      configName,
      botInfo,
    });
  } catch (error) {
    if (error instanceof LineTestError) {
      return NextResponse.json(
        { success: false, error: `LINE OA 串接測試失敗：${error.message}`, errorCode: error.errorCode, hint: error.hint },
        { status: error.status }
      );
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `LINE OA 串接測試失敗：${detail}`, errorCode: "UNEXPECTED_ERROR" },
      { status: 500 }
    );
  }
}
