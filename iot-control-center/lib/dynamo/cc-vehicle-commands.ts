import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";

import type { VehicleCommand, VehicleCommandStatus, VehicleCommandType } from "@/lib/control-center/vehicles/types";
import { ddb, TABLES } from "./client";
import { VEHICLE_COMMAND_TTL_SECONDS, expiresAtFrom } from "./ttl";

export type CCVehicleCommand = VehicleCommand;

export interface CreateCommandInput {
  vehicleId: string;
  type: VehicleCommandType;
  args: Record<string, unknown>;
  timeoutMs: number;
  issuedBy: string;
}

export async function createCommand(input: CreateCommandInput): Promise<CCVehicleCommand> {
  const now = Date.now();
  const command: CCVehicleCommand = {
    id: createId(),
    vehicleId: input.vehicleId,
    type: input.type,
    args: input.args,
    status: "pending",
    timeoutMs: input.timeoutMs,
    issuedBy: input.issuedBy,
    createdAt: now,
    expiresAt: expiresAtFrom(now, VEHICLE_COMMAND_TTL_SECONDS),
  };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_VEHICLE_COMMANDS, Item: command }));
  return command;
}

/**
 * Records a command that was issued over the direct link and already run by
 * the companion, so the log shows it. Idempotent on id (the companion resends
 * its audit entries until a telemetry POST succeeds).
 */
export async function recordDirectCommand(
  entry: Pick<CCVehicleCommand, "id" | "vehicleId" | "type" | "args" | "status" | "timeoutMs" | "issuedBy" | "createdAt"> &
    Partial<Pick<CCVehicleCommand, "ackedAt" | "code" | "msg" | "result">>
): Promise<void> {
  const item: CCVehicleCommand = {
    ...entry,
    via: "direct",
    expiresAt: expiresAtFrom(entry.createdAt, VEHICLE_COMMAND_TTL_SECONDS),
  };
  await ddb
    .send(new PutCommand({ TableName: TABLES.CC_VEHICLE_COMMANDS, Item: item, ConditionExpression: "attribute_not_exists(id)" }))
    .catch((err: { name?: string }) => {
      if (err?.name !== "ConditionalCheckFailedException") throw err;
    });
}

export async function getCommand(id: string): Promise<CCVehicleCommand | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_VEHICLE_COMMANDS, Key: { id } }));
  return (res.Item as CCVehicleCommand) ?? null;
}

/** Newest-first command log for a vehicle. */
export async function listCommandsByVehicle(vehicleId: string, limit = 50): Promise<CCVehicleCommand[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_VEHICLE_COMMANDS,
      IndexName: "vehicle-index",
      KeyConditionExpression: "vehicleId = :vid",
      ExpressionAttributeValues: { ":vid": vehicleId },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (res.Items ?? []) as CCVehicleCommand[];
}

/** Commands still awaiting the companion (pending or sent). Small scan window
 *  via the vehicle GSI, then filtered in memory — a vehicle rarely has more
 *  than a handful in flight. */
export async function listPendingByVehicle(vehicleId: string): Promise<CCVehicleCommand[]> {
  const recent = await listCommandsByVehicle(vehicleId, 50);
  return recent.filter((c) => c.status === "pending" || c.status === "sent");
}

/** Flips pending commands to `sent` once they have been handed to the companion
 *  (published or piggybacked). Conditional so a concurrent ack is not clobbered. */
export async function markSent(ids: string[], now: number = Date.now()): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      ddb
        .send(
          new UpdateCommand({
            TableName: TABLES.CC_VEHICLE_COMMANDS,
            Key: { id },
            UpdateExpression: "SET #s = :sent, sentAt = :now",
            ConditionExpression: "#s = :pending",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":sent": "sent", ":pending": "pending", ":now": now },
          })
        )
        .catch(() => {
          /* condition failed: another writer already advanced this row */
        })
    )
  );
}

/** Marks commands as timed out, only if still pending/sent. */
export async function markTimedOut(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      ddb
        .send(
          new UpdateCommand({
            TableName: TABLES.CC_VEHICLE_COMMANDS,
            Key: { id },
            UpdateExpression: "SET #s = :timeout",
            ConditionExpression: "#s IN (:pending, :sent)",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":timeout": "timeout", ":pending": "pending", ":sent": "sent" },
          })
        )
        .catch(() => {
          /* already settled */
        })
    )
  );
}

/** Applies an ack. Writes status/code/msg/result/ackedAt/late; refuses to
 *  overwrite an already-settled (acked/failed) row via a condition. */
export async function applyAckUpdate(
  id: string,
  patch: { status: VehicleCommandStatus; code?: string; msg?: string; result?: Record<string, unknown>; ackedAt: number; late?: boolean }
): Promise<boolean> {
  const sets = ["#s = :st", "ackedAt = :at"];
  const names: Record<string, string> = { "#s": "status" };
  const values: Record<string, unknown> = { ":st": patch.status, ":at": patch.ackedAt, ":acked": "acked", ":failed": "failed" };
  if (patch.code !== undefined) {
    sets.push("code = :code");
    values[":code"] = patch.code;
  }
  if (patch.msg !== undefined) {
    sets.push("msg = :msg");
    values[":msg"] = patch.msg;
  }
  if (patch.result !== undefined) {
    sets.push("#r = :res");
    names["#r"] = "result";
    values[":res"] = patch.result;
  }
  if (patch.late) {
    sets.push("late = :late");
    values[":late"] = true;
  }
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.CC_VEHICLE_COMMANDS,
        Key: { id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "#s <> :acked AND #s <> :failed",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );
    return true;
  } catch {
    return false;
  }
}
