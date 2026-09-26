import { describe, expect, it } from "vitest";

import { deriveDirectKey, signTicket, verifyTicket, type DirectTicketPayload } from "./directTicket";

// Shared with companion/tests/test_direct.py — change both together.
const VECTOR = {
  master: "test-master-secret",
  vehicleId: "veh123",
  tokenId: "tok456",
  payload: { vid: "veh123", sub: "user1", scope: "control", exp: 2_000_000_000_000, n: "abc" } as DirectTicketPayload,
};

describe("direct tickets", () => {
  const key = deriveDirectKey(VECTOR.master, VECTOR.vehicleId, VECTOR.tokenId);

  it("derives a stable per-vehicle, per-token key", () => {
    expect(key).toBe("wQ4dBkwcNGKBtl9l88y5Ekrb1BRn9o8EhvZY_jhMY7I");
    expect(deriveDirectKey(VECTOR.master, VECTOR.vehicleId, "other")).not.toBe(key);
  });

  it("signs deterministically so the companion can verify the same bytes", () => {
    expect(signTicket(key, VECTOR.payload)).toBe(
      "eyJ2aWQiOiJ2ZWgxMjMiLCJzdWIiOiJ1c2VyMSIsInNjb3BlIjoiY29udHJvbCIsImV4cCI6MjAwMDAwMDAwMDAwMCwibiI6ImFiYyJ9.kV03s-wBTEgvORIRulwqirmXF0iLiuPWbOKVvm2JbmA"
    );
  });

  it("verifies a good ticket and rejects tampering, other vehicles and expiry", () => {
    const t = signTicket(key, VECTOR.payload);
    expect(verifyTicket(key, t, "veh123", 1_000)).toEqual(VECTOR.payload);
    expect(verifyTicket(key, t, "other", 1_000)).toBeNull();
    expect(verifyTicket(key, t, "veh123", 2_000_000_000_001)).toBeNull();
    const [body, sig] = t.split(".");
    expect(verifyTicket(key, `${body}x.${sig}`, "veh123", 1_000)).toBeNull();
    expect(verifyTicket("wrong", t, "veh123", 1_000)).toBeNull();
    expect(verifyTicket(key, "garbage", "veh123", 1_000)).toBeNull();
  });
});
