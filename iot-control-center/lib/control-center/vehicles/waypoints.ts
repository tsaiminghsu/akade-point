import type { MissionItem } from "./types";

/**
 * Parser/serializer for the QGC WPL 110 waypoint file — the format
 * MissionPlanner and QGroundControl read and write. Pure and isomorphic (no
 * Node/browser APIs) so it runs in the browser importer and in tests.
 *
 * Format: a header line `QGC WPL 110`, then one tab-separated row per item:
 *   seq  current  frame  command  param1 param2 param3 param4  lat lon alt  autocontinue
 * seq 0 is the home position and is kept as an ordinary item so files round-trip.
 */

const HEADER = "QGC WPL 110";

export type ParseResult =
  | { ok: true; items: MissionItem[] }
  | { ok: false; error: string; line: number };

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Parses a `.waypoints` file. Tolerant of CRLF, trailing blank lines, and
 *  either tabs or runs of whitespace between columns. */
export function parseWaypointsFile(text: string): ParseResult {
  const rawLines = text.split(/\r?\n/);
  // Find the header, skipping leading blank lines.
  let i = 0;
  while (i < rawLines.length && isBlank(rawLines[i])) i += 1;
  if (i >= rawLines.length) return { ok: false, error: "Empty file", line: 1 };
  if (rawLines[i].trim() !== HEADER) {
    return { ok: false, error: `Expected "${HEADER}" header`, line: i + 1 };
  }
  i += 1;

  const items: MissionItem[] = [];
  for (; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (isBlank(line)) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length !== 12) {
      return { ok: false, error: `Expected 12 columns, got ${cols.length}`, line: i + 1 };
    }
    const nums = cols.map(Number);
    if (nums.some((n) => Number.isNaN(n))) {
      return { ok: false, error: "Non-numeric value in row", line: i + 1 };
    }
    const [seq, cur, frame, cmd, p1, p2, p3, p4, lat, lon, alt, ac] = nums;
    items.push({ seq, cur, frame, cmd, p1, p2, p3, p4, lat, lon, alt, ac });
  }

  if (items.length === 0) return { ok: false, error: "No waypoints found", line: i };
  return { ok: true, items };
}

/** Formats a coordinate with 8 decimals (MissionPlanner's precision) but no
 *  trailing-zero noise for integers like frame/command. */
function fmtCoord(n: number): string {
  return n.toFixed(8);
}

function fmtParam(n: number): string {
  // MissionPlanner writes params with up to 8 decimals; keep integers clean.
  return Number.isInteger(n) ? String(n) : n.toFixed(8);
}

/** Serializes mission items back to QGC WPL 110 text (tab-separated, LF). */
export function serializeWaypointsFile(items: MissionItem[]): string {
  const lines = [HEADER];
  for (const it of items) {
    lines.push(
      [
        it.seq,
        it.cur,
        it.frame,
        it.cmd,
        fmtParam(it.p1),
        fmtParam(it.p2),
        fmtParam(it.p3),
        fmtParam(it.p4),
        fmtCoord(it.lat),
        fmtCoord(it.lon),
        fmtParam(it.alt),
        it.ac,
      ].join("\t")
    );
  }
  return lines.join("\n") + "\n";
}
