import { describe, expect, it } from "vitest";

import { parseWaypointsFile, serializeWaypointsFile } from "./waypoints";
import type { MissionItem } from "./types";

// A small MissionPlanner-style file: home (seq 0), takeoff, waypoint, RTL.
const SAMPLE = [
  "QGC WPL 110",
  "0\t1\t0\t16\t0\t0\t0\t0\t24.99999900\t121.00000100\t0\t1",
  "1\t0\t3\t22\t0\t0\t0\t0\t0.00000000\t0.00000000\t10\t1",
  "2\t0\t3\t16\t0\t0\t0\t0\t24.99555500\t121.00666600\t20\t1",
  "3\t0\t0\t20\t0\t0\t0\t0\t0.00000000\t0.00000000\t0\t1",
  "",
].join("\r\n");

describe("parseWaypointsFile", () => {
  it("parses a MissionPlanner file with CRLF and a trailing blank line", () => {
    const res = parseWaypointsFile(SAMPLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(4);
    expect(res.items[0]).toMatchObject({ seq: 0, cmd: 16, lat: 24.999999, lon: 121.000001 });
    expect(res.items[1]).toMatchObject({ seq: 1, frame: 3, cmd: 22, alt: 10 });
    expect(res.items[3]).toMatchObject({ cmd: 20 });
  });

  it("tolerates space-separated columns", () => {
    const res = parseWaypointsFile("QGC WPL 110\n0 1 0 16 0 0 0 0 1.5 2.5 0 1\n");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.items[0]).toMatchObject({ lat: 1.5, lon: 2.5 });
  });

  it("rejects a missing/wrong header with the line number", () => {
    const res = parseWaypointsFile("not a header\n0\t1\t0\t16\t0\t0\t0\t0\t0\t0\t0\t1\n");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.line).toBe(1);
      expect(res.error).toMatch(/QGC WPL 110/);
    }
  });

  it("rejects a row with the wrong column count", () => {
    const res = parseWaypointsFile("QGC WPL 110\n0\t1\t0\t16\t0\t0\n");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.line).toBe(2);
  });

  it("rejects a non-numeric value", () => {
    const res = parseWaypointsFile("QGC WPL 110\n0\t1\t0\tWAYPOINT\t0\t0\t0\t0\t0\t0\t0\t1\n");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Non-numeric/);
  });

  it("rejects an empty file", () => {
    expect(parseWaypointsFile("").ok).toBe(false);
    expect(parseWaypointsFile("   \n  \n").ok).toBe(false);
  });
});

describe("serializeWaypointsFile", () => {
  it("round-trips parse → serialize → parse to equal items", () => {
    const parsed = parseWaypointsFile(SAMPLE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const text = serializeWaypointsFile(parsed.items);
    const reparsed = parseWaypointsFile(text);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.items).toEqual(parsed.items);
  });

  it("starts with the header and ends with a newline", () => {
    const items: MissionItem[] = [
      { seq: 0, cur: 1, frame: 0, cmd: 16, p1: 0, p2: 0, p3: 0, p4: 0, lat: 1, lon: 2, alt: 0, ac: 1 },
    ];
    const text = serializeWaypointsFile(items);
    expect(text.startsWith("QGC WPL 110\n")).toBe(true);
    expect(text.endsWith("\n")).toBe(true);
  });
});
