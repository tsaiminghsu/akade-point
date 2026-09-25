import type { VehicleAck, VehicleCommand, VehicleCommandMsg, VehicleCommandStatus } from "./types";

const TERMINAL: VehicleCommandStatus[] = ["acked", "failed"];

/** A command is settled once it has an ack. `timeout` is NOT terminal: a late
 *  ack can still arrive and flip it to acked/failed. */
export function isTerminal(status: VehicleCommandStatus): boolean {
  return TERMINAL.includes(status);
}

/**
 * Marks pending/sent commands as `timeout` when their deadline has passed.
 * Pure: returns a new array plus the ids that flipped (the route persists those
 * with a conditional update). Deadline is measured from when the command was
 * sent, falling back to when it was created if it never got sent.
 */
export function resolveTimeouts(
  commands: VehicleCommand[],
  now: number = Date.now()
): { commands: VehicleCommand[]; timedOutIds: string[] } {
  const timedOutIds: string[] = [];
  const next = commands.map((cmd) => {
    if (cmd.status !== "pending" && cmd.status !== "sent") return cmd;
    const startedAt = cmd.sentAt ?? cmd.createdAt;
    if (now - startedAt < cmd.timeoutMs) return cmd;
    timedOutIds.push(cmd.id);
    return { ...cmd, status: "timeout" as const };
  });
  return { commands: next, timedOutIds };
}

/**
 * Applies a companion ack to a command. Returns the updated command, or null
 * when the ack should be ignored because the command is already settled
 * (acked/failed). A `timeout` command accepts a late ack and is flagged.
 */
export function applyAck(command: VehicleCommand, ack: VehicleAck, now: number = Date.now()): VehicleCommand | null {
  if (isTerminal(command.status)) return null;
  const late = command.status === "timeout";
  return {
    ...command,
    status: ack.st,
    code: ack.code,
    msg: ack.msg,
    result: ack.res,
    ackedAt: ack.t ?? now,
    ...(late ? { late: true } : {}),
  };
}

/** Projects a stored command down to the compact envelope the companion runs. */
export function toCommandMsg(command: VehicleCommand): VehicleCommandMsg {
  return {
    v: 1,
    id: command.id,
    type: command.type,
    args: command.args,
    iat: command.createdAt,
    to: command.timeoutMs,
  };
}
