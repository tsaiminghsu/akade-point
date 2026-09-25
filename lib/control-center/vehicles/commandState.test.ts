import { describe, expect, it } from "vitest";

import { applyAck, isTerminal, resolveTimeouts, toCommandMsg } from "./commandState";
import type { VehicleAck, VehicleCommand } from "./types";

function cmd(overrides: Partial<VehicleCommand> = {}): VehicleCommand {
  return {
    id: "c1",
    vehicleId: "v1",
    type: "arm",
    args: {},
    status: "pending",
    timeoutMs: 10_000,
    issuedBy: "admin",
    createdAt: 1000,
    ...overrides,
  };
}

describe("isTerminal", () => {
  it("treats acked/failed as terminal but not timeout", () => {
    expect(isTerminal("acked")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("timeout")).toBe(false);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("sent")).toBe(false);
  });
});

describe("resolveTimeouts", () => {
  it("times out a pending command past its deadline, measured from createdAt", () => {
    const { commands, timedOutIds } = resolveTimeouts([cmd({ createdAt: 0 })], 10_001);
    expect(commands[0].status).toBe("timeout");
    expect(timedOutIds).toEqual(["c1"]);
  });

  it("times out a sent command measured from sentAt, not createdAt", () => {
    const c = cmd({ status: "sent", createdAt: 0, sentAt: 100_000 });
    const before = resolveTimeouts([c], 105_000);
    expect(before.commands[0].status).toBe("sent");
    const after = resolveTimeouts([c], 110_001);
    expect(after.commands[0].status).toBe("timeout");
  });

  it("leaves settled commands untouched", () => {
    const { timedOutIds } = resolveTimeouts([cmd({ status: "acked", createdAt: 0 })], 10_000_000);
    expect(timedOutIds).toEqual([]);
  });
});

describe("applyAck", () => {
  const ack: VehicleAck = { v: 1, id: "c1", st: "acked", code: "MAV_RESULT_ACCEPTED", t: 2000 };

  it("applies an ack to a pending command", () => {
    const out = applyAck(cmd(), ack);
    expect(out).not.toBeNull();
    expect(out!.status).toBe("acked");
    expect(out!.code).toBe("MAV_RESULT_ACCEPTED");
    expect(out!.ackedAt).toBe(2000);
    expect(out!.late).toBeUndefined();
  });

  it("accepts a late ack on a timed-out command and flags it", () => {
    const out = applyAck(cmd({ status: "timeout" }), ack);
    expect(out!.status).toBe("acked");
    expect(out!.late).toBe(true);
  });

  it("ignores an ack on an already-settled command", () => {
    expect(applyAck(cmd({ status: "acked" }), ack)).toBeNull();
    expect(applyAck(cmd({ status: "failed" }), ack)).toBeNull();
  });

  it("records a failed ack with its code and message", () => {
    const out = applyAck(cmd(), { v: 1, id: "c1", st: "failed", code: "NOT_ARMED", msg: "vehicle disarmed", t: 3000 });
    expect(out!.status).toBe("failed");
    expect(out!.msg).toBe("vehicle disarmed");
  });
});

describe("toCommandMsg", () => {
  it("produces a compact envelope under 1 KB", () => {
    const msg = toCommandMsg(cmd({ type: "goto", args: { lat: 24.1, lon: 121.2, alt: 30 } }));
    expect(msg).toEqual({ v: 1, id: "c1", type: "goto", args: { lat: 24.1, lon: 121.2, alt: 30 }, iat: 1000, to: 10_000 });
    expect(JSON.stringify(msg).length).toBeLessThan(1024);
  });
});
