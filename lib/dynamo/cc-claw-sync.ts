import { DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { BoardNotify, ClawAck, ClawSync } from "@/lib/control-center/claw/device";
import { ddb, paginatedScan, TABLES } from "./client";

/** One row per machine: what its board last pulled and applied. */
export type CCClawSync = ClawSync;

export async function listClawSync(): Promise<CCClawSync[]> {
  return paginatedScan<CCClawSync>(TABLES.CC_CLAW_SYNC);
}

export async function getClawSync(machineId: string): Promise<CCClawSync | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_CLAW_SYNC, Key: { machineId } }));
  return (res.Item as CCClawSync) ?? null;
}

export async function recordPull(
  machineId: string,
  pull: { sha: string; rev: number; fw?: string; notify: BoardNotify; now: number }
): Promise<void> {
  const values: Record<string, unknown> = { ":now": pull.now, ":sha": pull.sha, ":rev": pull.rev, ":notify": pull.notify };
  const sets = ["pulledAt = :now", "pulledSha = :sha", "pulledRevision = :rev", "notify = :notify"];
  if (pull.fw) {
    values[":fw"] = pull.fw;
    sets.push("fw = :fw");
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_CLAW_SYNC,
      Key: { machineId },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeValues: values,
    })
  );
}

/**
 * Store a board's report. An `applied` report also moves appliedSha; a
 * `failed` one leaves it on the config the board is still running.
 */
export async function recordAck(machineId: string, ack: ClawAck, fw?: string): Promise<void> {
  const values: Record<string, unknown> = { ":ack": ack, ":now": ack.t };
  // `pulledAt` too: a board that reports is plainly connected.
  const sets = ["lastAck = :ack", "pulledAt = :now"];
  if (ack.st === "applied") {
    values[":sha"] = ack.sha;
    values[":rev"] = ack.rev;
    sets.push("appliedSha = :sha", "appliedRevision = :rev", "appliedAt = :now");
  }
  if (fw) {
    values[":fw"] = fw;
    sets.push("fw = :fw");
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.CC_CLAW_SYNC,
      Key: { machineId },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeValues: values,
    })
  );
}

export async function deleteClawSync(machineId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_CLAW_SYNC, Key: { machineId } }));
}
