import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("./client", () => ({
  ddb: { send: (...args: unknown[]) => send(...args) },
  TABLES: { CC_VEHICLE_COMMANDS: "akade-cc-vehicle-commands" },
}));

const { applyAckUpdate, markSent, markTimedOut } = await import("./cc-vehicle-commands");

function inputOf(callIndex: number) {
  return send.mock.calls[callIndex][0].input as {
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues: Record<string, unknown>;
  };
}

describe("markSent", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it("advances pending → sent under a status condition", async () => {
    await markSent(["c1"], 5000);
    const input = inputOf(0);
    expect(input.ConditionExpression).toBe("#s = :pending");
    expect(input.ExpressionAttributeValues[":sent"]).toBe("sent");
    expect(input.ExpressionAttributeValues[":now"]).toBe(5000);
  });

  it("swallows a condition failure (already advanced)", async () => {
    send.mockRejectedValueOnce(new Error("ConditionalCheckFailed"));
    await expect(markSent(["c1"])).resolves.toBeUndefined();
  });
});

describe("markTimedOut", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it("only flips rows still pending or sent", async () => {
    await markTimedOut(["c1"]);
    const input = inputOf(0);
    expect(input.ConditionExpression).toBe("#s IN (:pending, :sent)");
    expect(input.ExpressionAttributeValues[":timeout"]).toBe("timeout");
  });
});

describe("applyAckUpdate", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it("aliases status and refuses to overwrite a settled row", async () => {
    const ok = await applyAckUpdate("c1", { status: "acked", code: "MAV_RESULT_ACCEPTED", ackedAt: 9000 });
    expect(ok).toBe(true);
    const input = inputOf(0);
    expect(input.ExpressionAttributeNames?.["#s"]).toBe("status");
    expect(input.ConditionExpression).toBe("#s <> :acked AND #s <> :failed");
    expect(input.ExpressionAttributeValues[":st"]).toBe("acked");
  });

  it("includes late and result fields when present", async () => {
    await applyAckUpdate("c1", { status: "acked", ackedAt: 1, late: true, result: { alt: 10 } });
    const input = inputOf(0);
    expect(input.ExpressionAttributeValues[":late"]).toBe(true);
    expect(input.ExpressionAttributeNames?.["#r"]).toBe("result");
  });

  it("returns false when the conditional update throws", async () => {
    send.mockRejectedValueOnce(new Error("ConditionalCheckFailed"));
    const ok = await applyAckUpdate("c1", { status: "failed", ackedAt: 1 });
    expect(ok).toBe(false);
  });
});
