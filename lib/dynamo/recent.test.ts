import { describe, expect, it } from "vitest";

import { mergeRecent } from "./recent";

interface Row {
  id: string;
  t: number;
}

const key = (r: Row) => r.t;
const tie = (r: Row) => r.id;

describe("mergeRecent", () => {
  it("merges per-partition lists newest first", () => {
    const a: Row[] = [
      { id: "a2", t: 200 },
      { id: "a1", t: 100 },
    ];
    const b: Row[] = [
      { id: "b3", t: 300 },
      { id: "b1", t: 150 },
    ];
    expect(mergeRecent([a, b], key, 10, tie).map((r) => r.id)).toEqual(["b3", "a2", "b1", "a1"]);
  });

  it("caps at the limit", () => {
    const rows: Row[] = [
      { id: "c", t: 3 },
      { id: "b", t: 2 },
      { id: "a", t: 1 },
    ];
    expect(mergeRecent([rows], key, 2, tie).map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("breaks ties deterministically, so identical requests agree", () => {
    // One simulation tick stamps every event with the same timestamp.
    const first = mergeRecent([[{ id: "z", t: 5 }], [{ id: "a", t: 5 }]], key, 10, tie);
    const second = mergeRecent([[{ id: "a", t: 5 }], [{ id: "z", t: 5 }]], key, 10, tie);
    expect(first.map((r) => r.id)).toEqual(["a", "z"]);
    expect(second.map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("handles empty and absent partitions", () => {
    expect(mergeRecent<Row>([], key, 5, tie)).toEqual([]);
    expect(mergeRecent<Row>([[], []], key, 5, tie)).toEqual([]);
  });
});
