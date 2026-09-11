import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { buildUpdateExpression, ddb, TABLES } from "./client";

export type CCMachineWidgetSize = "small" | "medium" | "large";
export type CCEditorMode = "edit" | "live";

export interface CCStoreSettings {
  storeId: string;

  gridSize: number;
  snapEnabled: boolean;
  gridVisible: boolean;
  animationEnabled: boolean;

  toastAlerts: boolean;
  emailDigest: boolean;
  criticalOnly: boolean;
  sound: boolean;

  mqttBroker: string;
  mqttTopic: string;
  mqttClientId: string;

  apiEndpoint: string;
  apiKey: string;

  defaultWidgetSize: CCMachineWidgetSize;
  defaultMode: CCEditorMode;
}

export async function getStoreSettings(storeId: string): Promise<CCStoreSettings | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_STORE_SETTINGS, Key: { storeId } }));
  return (res.Item as CCStoreSettings) ?? null;
}

/** Creates the row on first write and merges on every write after — UpdateItem
 *  creates the item if it doesn't exist yet, so this doubles as upsert. */
export async function updateStoreSettings(
  storeId: string,
  patch: Partial<Omit<CCStoreSettings, "storeId">>
): Promise<void> {
  const update = buildUpdateExpression(patch);
  if (!update) return;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_STORE_SETTINGS,
      Key: { storeId },
      ...update,
    })
  );
}
