import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";
import {
  getLineAuthRuntimeConfig,
  saveLineAuthRuntimeConfigs,
} from "@/lib/auth/lineRuntimeConfig";
import { resolveRequestOrigin } from "@/lib/auth/requestOrigin";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const userId = (session.user as { id: string }).id;
  const user = await getUser(userId);
  return user?.isAdmin ? user : null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = resolveRequestOrigin(request);
  const config = await getLineAuthRuntimeConfig(origin);
  const active =
    config.configs.find((item) => item.id === config.activeConfigId) || config.configs[0] || null;

  return NextResponse.json({
    configured: Boolean(active?.channelId && active.channelSecret),
    source: config.source,
    activeConfigId: config.activeConfigId,
    redirectUri: config.redirectUri,
    configs: config.configs,
    messagingApiConfigs: config.messagingApiConfigs,
    updatedAt: active?.updatedAt ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      activeConfigId?: unknown;
      configs?: unknown;
      messagingApiConfigs?: unknown;
    };

    if (!Array.isArray(body.configs)) {
      return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
    }

    const configs = body.configs.map((item) => {
      const value = item as {
        id?: unknown;
        name?: unknown;
        channelId?: unknown;
        channelSecret?: unknown;
      };
      if (
        typeof value.name !== "string" ||
        typeof value.channelId !== "string" ||
        typeof value.channelSecret !== "string"
      ) {
        throw new Error("設定項目格式錯誤");
      }
      return {
        id: typeof value.id === "string" ? value.id : undefined,
        name: value.name,
        channelId: value.channelId,
        channelSecret: value.channelSecret,
      };
    });

    const messagingApiConfigs = Array.isArray(body.messagingApiConfigs)
      ? body.messagingApiConfigs.map((item) => {
          const value = item as {
            id?: unknown;
            name?: unknown;
            channelId?: unknown;
            channelSecret?: unknown;
            isEnabled?: unknown;
          };
          if (
            typeof value.name !== "string" ||
            typeof value.channelId !== "string" ||
            typeof value.channelSecret !== "string"
          ) {
            throw new Error("Messaging API 設定項目格式錯誤");
          }
          return {
            id: typeof value.id === "string" ? value.id : undefined,
            name: value.name,
            channelId: value.channelId,
            channelSecret: value.channelSecret,
            isEnabled: value.isEnabled !== false,
          };
        })
      : [];

    const origin = resolveRequestOrigin(request);
    const nextConfig = await saveLineAuthRuntimeConfigs(
      {
        activeConfigId: typeof body.activeConfigId === "string" ? body.activeConfigId : null,
        configs,
        messagingApiConfigs,
      },
      origin
    );

    const active =
      nextConfig.configs.find((item) => item.id === nextConfig.activeConfigId) ||
      nextConfig.configs[0] ||
      null;

    return NextResponse.json({
      configured: Boolean(active?.channelId && active.channelSecret),
      source: nextConfig.source,
      activeConfigId: nextConfig.activeConfigId,
      redirectUri: nextConfig.redirectUri,
      configs: nextConfig.configs,
      messagingApiConfigs: nextConfig.messagingApiConfigs,
      updatedAt: active?.updatedAt ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新設定失敗" },
      { status: 400 }
    );
  }
}
