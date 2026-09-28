import { describe, expect, it } from "vitest";

import { activeLease, blockingLease } from "./lease";

const lease = { cid: "page-A", sub: "u1", name: "Amy", until: 10_000, since: 1_000 };

describe("control lease", () => {
  it("is active only until it runs out", () => {
    expect(activeLease(lease, 9_999)).toBe(lease);
    expect(activeLease(lease, 10_000)).toBeNull();
    expect(activeLease(undefined, 0)).toBeNull();
  });

  it("blocks every page but the holder while active", () => {
    expect(blockingLease(lease, "page-A", 5_000)).toBeNull();
    expect(blockingLease(lease, "page-B", 5_000)).toBe(lease);
    expect(blockingLease(lease, null, 5_000)).toBe(lease); // scripts without a page id too
    expect(blockingLease(lease, "page-B", 10_001)).toBeNull();
    expect(blockingLease(null, "page-B", 0)).toBeNull(); // nobody holds control: anyone may
  });
});
