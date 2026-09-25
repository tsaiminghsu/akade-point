import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import {
  defaultDraft,
  toClawConfig,
  type ClawConfig,
  type ClawConfigPart,
  type ClawDraft,
} from "@/lib/control-center/claw/config";
import { ddb, paginatedScan, TABLES } from "./client";

/** One row per machine, keyed by machineId. A machine without a row runs factory defaults. */
export type CCClawConfig = ClawConfig;

export async function listClawConfigs(): Promise<CCClawConfig[]> {
  const rows = await paginatedScan<Record<string, unknown>>(TABLES.CC_CLAW_CONFIGS);
  return rows.map(toClawConfig);
}

export async function getClawConfig(machineId: string): Promise<CCClawConfig | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_CLAW_CONFIGS, Key: { machineId } }));
  return res.Item ? toClawConfig(res.Item) : null;
}

/**
 * Save the editor's config if nobody else saved since it loaded
 * `expectedRevision` (0 = the machine had no row). Returns null on a conflict.
 */
export async function saveClawConfig(
  machineId: string,
  draft: ClawDraft,
  expectedRevision: number,
  updatedBy: string
): Promise<CCClawConfig | null> {
  const config: CCClawConfig = {
    machineId,
    settings: draft.settings,
    rig: draft.rig,
    revision: expectedRevision + 1,
    updatedAt: Date.now(),
    updatedBy,
  };
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLES.CC_CLAW_CONFIGS,
        Item: config,
        ...(expectedRevision === 0
          ? { ConditionExpression: "attribute_not_exists(machineId)" }
          : {
              ConditionExpression: "revision = :r",
              ExpressionAttributeValues: { ":r": expectedRevision },
            }),
      })
    );
    return config;
  } catch (err) {
    // By name, not instanceof: the SDK can be bundled more than once.
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") return null;
    throw err;
  }
}

/**
 * Overwrite some parts of a machine's config (a bulk copy), creating the row
 * if needed. The other part keeps its saved value, or the factory one on a new
 * row. No revision check: a copy is a deliberate overwrite, and bumping the
 * revision makes any editor that still has the old one open get a conflict.
 */
export async function applyClawConfigParts(
  machineId: string,
  draft: ClawDraft,
  parts: readonly ClawConfigPart[],
  updatedBy: string
): Promise<CCClawConfig> {
  const factory = defaultDraft();
  const values: Record<string, unknown> = { ":now": Date.now(), ":by": updatedBy, ":one": 1 };
  const sets = ["updatedAt = :now", "updatedBy = :by"];
  for (const part of ["settings", "rig"] as const) {
    if (parts.includes(part)) {
      values[`:${part}`] = draft[part];
      sets.push(`${part} = :${part}`);
    } else {
      values[`:${part}Default`] = factory[part];
      sets.push(`${part} = if_not_exists(${part}, :${part}Default)`);
    }
  }
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_CLAW_CONFIGS,
      Key: { machineId },
      UpdateExpression: `SET ${sets.join(", ")} ADD revision :one`,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );
  return toClawConfig(res.Attributes ?? { machineId });
}

export async function deleteClawConfig(machineId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_CLAW_CONFIGS, Key: { machineId } }));
}
