import { describe, expect, it } from "vitest";

import { formatToken, generateSecret, hashesEqual, hashToken, parseToken } from "./token";

describe("token", () => {
  it("formats and parses a token round-trip", () => {
    const token = formatToken("tok123", "secretpart");
    expect(token).toBe("vt_tok123_secretpart");
    expect(parseToken(token)).toEqual({ tokenId: "tok123", secret: "secretpart" });
  });

  it("rejects malformed tokens", () => {
    expect(parseToken("nope")).toBeNull();
    expect(parseToken("vt_only")).toBeNull();
    expect(parseToken("xx_a_b")).toBeNull();
    expect(parseToken("vt__b")).toBeNull();
    expect(parseToken("vt_a_b_c")).toBeNull();
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
