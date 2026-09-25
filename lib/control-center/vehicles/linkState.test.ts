import { describe, expect, it } from "vitest";

import { linkStateOf } from "./linkState";

describe("linkStateOf", () => {
  const now = 1_000_000;

  it("is offline when never seen", () => {
    expect(linkStateOf(null, now)).toBe("offline");
    expect(linkStateOf(undefined, now)).toBe("offline");
  });

  it("is online within 10s", () => {
    expect(linkStateOf(now, now)).toBe("online");
    expect(linkStateOf(now - 9_999, now)).toBe("online");
  });

  it("is stale between 10s and 60s", () => {
    expect(linkStateOf(now - 10_000, now)).toBe("stale");
    expect(linkStateOf(now - 59_999, now)).toBe("stale");
  });

  it("is offline past 60s", () => {
    expect(linkStateOf(now - 60_000, now)).toBe("offline");
    expect(linkStateOf(now - 500_000, now)).toBe("offline");
  });
});
