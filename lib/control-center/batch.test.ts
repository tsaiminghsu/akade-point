import { describe, expect, it } from "vitest";

import { chunk } from "./batch";

describe("chunk", () => {
  it("splits into full slices with a shorter remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one slice when the input fits", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("returns nothing for an empty input", () => {
    expect(chunk([], 25)).toEqual([]);
  });

  it("rejects a non-positive size instead of looping forever", () => {
    expect(() => chunk([1], 0)).toThrow(/size must be >= 1/);
  });
});
