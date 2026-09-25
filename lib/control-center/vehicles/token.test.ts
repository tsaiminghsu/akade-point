import { describe, expect, it } from "vitest";

import { formatToken, generateSecret, hashesEqual, hashToken, parseToken } from "./token";

describe("token", () => {
  it("formats and parses a token round-trip", () => {
    const token = formatToken("tok123", "secretpart");
    expect(token).toBe("vt_tok123_secretpart");
    expect(parseToken(token)).toEqual({ tokenId: "tok123", secret: "secretpart" });
  });

  it("keeps a base64url secret that contains underscores intact", () => {
    // Real secrets are base64url and can contain "_" and "-".
    const secret = "W90dX1VMSw9BRhds11giSnmzHkabfn1v_cd2BQUlv-4";
    const token = formatToken("cuid2id", secret);
    expect(parseToken(token)).toEqual({ tokenId: "cuid2id", secret });
    expect(hashToken(token)).toBe(hashToken(formatToken("cuid2id", secret)));
  });

  it("rejects malformed tokens", () => {
    expect(parseToken("nope")).toBeNull();
    expect(parseToken("vt_only")).toBeNull();
    expect(parseToken("xx_a_b")).toBeNull();
    expect(parseToken("vt__b")).toBeNull();
    // "vt_a_b_c" is now VALID: tokenId "a", secret "b_c".
    expect(parseToken("vt_a_b_c")).toEqual({ tokenId: "a", secret: "b_c" });
  });

  it("keeps vehicle and machine tokens apart by prefix", () => {
    const machine = formatToken("id1", "sec", "mt");
    expect(machine).toBe("mt_id1_sec");
    expect(parseToken(machine, "mt")).toEqual({ tokenId: "id1", secret: "sec" });
    // A machine token is not a vehicle token, and vice versa.
    expect(parseToken(machine)).toBeNull();
    expect(parseToken(formatToken("id1", "sec"), "mt")).toBeNull();
  });

  it("hashes deterministically and differs by input", () => {
    const a = hashToken("vt_a_b");
    expect(a).toBe(hashToken("vt_a_b"));
    expect(a).not.toBe(hashToken("vt_a_c"));
    expect(a).toHaveLength(64); // sha256 hex
  });

  it("generates url-safe secrets of adequate length", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeGreaterThanOrEqual(43);
  });

  it("compares hashes in constant time", () => {
    const h = hashToken("vt_x_y");
    expect(hashesEqual(h, h)).toBe(true);
    expect(hashesEqual(h, hashToken("vt_x_z"))).toBe(false);
    expect(hashesEqual(h, "short")).toBe(false);
  });
});
