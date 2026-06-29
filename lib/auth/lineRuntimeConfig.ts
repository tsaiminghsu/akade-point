import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamo/client";

export interface LineAuthConfigItem {
  id: string;
  name: string;
  channelId: string;
  channelSecret: string;
  isActive: boolean;
  updatedAt: string;
}

export interface MessagingApiConfigItem {
  id: string;
  name: string;
  channelId: string;
  channelSecret: string;
  isEnabled: boolean;
  updatedAt: string;
}

export interface LineAuthRuntimeConfig {
  source: "ui" | "env" | "unset";
  redirectUri: string;
  activeConfigId: string | null;
  configs: LineAuthConfigItem[];
  messagingApiConfigs: MessagingApiConfigItem[];
}

interface StoredLineAuthRuntimeConfig {
  version: 2;
  activeConfigId: string | null;
  configs: LineAuthConfigItem[];
  messagingApiConfigs?: MessagingApiConfigItem[];
  updatedAt: string;
}

const LINE_AUTH_PK = "LINE_AUTH_CONFIG";
const LINE_AUTH_SK = "RUNTIME";
const NEXTAUTH_CALLBACK_PATH = "/api/auth/callback/line";

// 30-second in-memory cache to avoid DynamoDB on every auth request
let cachedConfig: { value: { clientId: string; clientSecret: string }; expiresAt: number } | null = null;

function buildRedirectUri(origin: string): string {
  return `${origin}${NEXTAUTH_CALLBACK_PATH}`;
}

function normalize(value: string): string {
  return value.trim();
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 40);
}

function createId(): string {
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function validateItem(item: Omit<LineAuthConfigItem, "updatedAt" | "isActive">): void {
  if (!item.name) throw new Error("設定名稱不可空白");
  if (!item.channelId) throw new Error("Channel ID 不可空白");
  if (!item.channelSecret) throw new Error("Channel Secret 不可空白");
}

function validateMessagingApiItem(item: Omit<MessagingApiConfigItem, "updatedAt">): void {
  if (!item.name) throw new Error("Messaging API 設定名稱不可空白");
  if (!item.channelId) throw new Error("Messaging API Channel ID 不可空白");
  if (!item.channelSecret) throw new Error("Messaging API Channel Secret 不可空白");
}

function normalizeStored(parsed: StoredLineAuthRuntimeConfig): StoredLineAuthRuntimeConfig {
  const normalizedItems = (parsed.configs || []).map((item) => ({
    id: sanitizeId(normalize(item.id)) || createId(),
    name: normalize(item.name),
    channelId: normalize(item.channelId),
    channelSecret: normalize(item.channelSecret),
    isActive: false,
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));

  const activeConfigId =
    normalizedItems.find((item) => item.id === parsed.activeConfigId)?.id ||
    normalizedItems[0]?.id ||
    null;

  const configs = normalizedItems.map((item) => ({
    ...item,
    isActive: item.id === activeConfigId,
  }));

  const normalizedMessagingItems = (parsed.messagingApiConfigs || []).map((item) => ({
    id: sanitizeId(normalize(item.id)) || createId(),
    name: normalize(item.name),
    channelId: normalize(item.channelId),
    channelSecret: normalize(item.channelSecret),
    isEnabled: item.isEnabled !== false,
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));

  return {
    version: 2,
    activeConfigId,
    configs,
    messagingApiConfigs: normalizedMessagingItems,
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
}

async function readFromDynamo(): Promise<StoredLineAuthRuntimeConfig | null> {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLES.AUTH,
        Key: { PK: LINE_AUTH_PK, SK: LINE_AUTH_SK },
      })
    );

    const item = result.Item as Partial<StoredLineAuthRuntimeConfig & { PK: string; SK: string }> | undefined;
    if (!item || item.version !== 2 || !Array.isArray(item.configs)) {
      return null;
    }

    return normalizeStored({
      version: 2,
      activeConfigId: typeof item.activeConfigId === "string" ? item.activeConfigId : null,
      configs: item.configs as LineAuthConfigItem[],
      messagingApiConfigs: (item.messagingApiConfigs as MessagingApiConfigItem[]) || [],
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
    });
  } catch (error) {
    console.error("[lineRuntimeConfig] failed to read DynamoDB config", error);
    return null;
  }
}

async function writeToDynamo(config: StoredLineAuthRuntimeConfig): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLES.AUTH,
      Item: {
        PK: LINE_AUTH_PK,
        SK: LINE_AUTH_SK,
        entityType: "LINE_AUTH_RUNTIME_CONFIG",
        ...config,
      },
    })
  );
}

function getEnvFallbackConfig(): LineAuthConfigItem[] {
  const channelId = normalize(process.env.LINE_CLIENT_ID || "");
  const channelSecret = normalize(process.env.LINE_CLIENT_SECRET || "");
  if (!channelId || !channelSecret) return [];

  return [
    {
      id: "env-default",
      name: "環境變數設定",
      channelId,
      channelSecret,
      isActive: true,
      updatedAt: new Date().toISOString(),
    },
  ];
}

export async function getLineAuthRuntimeConfig(origin: string): Promise<LineAuthRuntimeConfig> {
  const redirectUri = buildRedirectUri(origin);
  const stored = await readFromDynamo();

  if (stored?.configs?.length || stored?.messagingApiConfigs?.length) {
    return {
      source: "ui",
      redirectUri,
      activeConfigId: stored.activeConfigId,
      configs: stored.configs || [],
      messagingApiConfigs: stored.messagingApiConfigs || [],
    };
  }

  const envConfigs = getEnvFallbackConfig();
  if (envConfigs.length) {
    return {
      source: "env",
      redirectUri,
      activeConfigId: envConfigs[0].id,
      configs: envConfigs,
      messagingApiConfigs: [],
    };
  }

  return {
    source: "unset",
    redirectUri,
    activeConfigId: null,
    configs: [],
    messagingApiConfigs: [],
  };
}

export async function saveLineAuthRuntimeConfigs(
  input: {
    activeConfigId: string | null;
    configs: Array<{
      id?: string;
      name: string;
      channelId: string;
      channelSecret: string;
    }>;
    messagingApiConfigs?: Array<{
      id?: string;
      name: string;
      channelId: string;
      channelSecret: string;
      isEnabled?: boolean;
    }>;
  },
  origin: string
): Promise<LineAuthRuntimeConfig> {
  const normalizedItems = input.configs.map((item) => {
    const normalized = {
      id: sanitizeId(normalize(item.id || "")) || createId(),
      name: normalize(item.name),
      channelId: normalize(item.channelId),
      channelSecret: normalize(item.channelSecret),
    };
    validateItem(normalized);
    return normalized;
  });

  const normalizedMessagingItems = (input.messagingApiConfigs || []).map((item) => {
    const normalized = {
      id: sanitizeId(normalize(item.id || "")) || createId(),
      name: normalize(item.name),
      channelId: normalize(item.channelId),
      channelSecret: normalize(item.channelSecret),
      isEnabled: item.isEnabled !== false,
    };
    validateMessagingApiItem(normalized);
    return normalized;
  });

  if (!normalizedItems.length && !normalizedMessagingItems.length) {
    throw new Error("至少需要一組 LINE 設定或 Messaging API 設定");
  }

  const activeConfigId =
    normalizedItems.find((item) => item.id === input.activeConfigId)?.id ||
    normalizedItems[0]?.id ||
    null;

  const stored: StoredLineAuthRuntimeConfig = {
    version: 2,
    activeConfigId,
    configs: normalizedItems.map((item) => ({
      ...item,
      isActive: item.id === activeConfigId,
      updatedAt: new Date().toISOString(),
    })),
    messagingApiConfigs: normalizedMessagingItems.map((item) => ({
      ...item,
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  };

  await writeToDynamo(stored);

  // Bust the in-memory cache so the next auth request picks up new credentials
  cachedConfig = null;

  return getLineAuthRuntimeConfig(origin);
}

/** Returns active LINE login credentials with 30-second in-memory cache. */
export async function getActiveLineConfig(): Promise<{ clientId: string; clientSecret: string }> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return cachedConfig.value;
  }

  const stored = await readFromDynamo();
  if (stored?.configs?.length) {
    const active =
      stored.configs.find((c) => c.id === stored.activeConfigId) || stored.configs[0];
    if (active?.channelId && active.channelSecret) {
      const value = { clientId: active.channelId, clientSecret: active.channelSecret };
      cachedConfig = { value, expiresAt: now + 30_000 };
      return value;
    }
  }

  // Fall back to environment variables
  const clientId = process.env.LINE_CLIENT_ID || "";
  const clientSecret = process.env.LINE_CLIENT_SECRET || "";
  const value = { clientId, clientSecret };
  cachedConfig = { value, expiresAt: now + 30_000 };
  return value;
}
