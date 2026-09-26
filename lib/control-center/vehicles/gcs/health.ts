/**
 * Traffic-light levels for the status bar and the alert engine. Thresholds
 * follow ArduPilot / Mission Planner guidance; every function answers
 * "unknown" rather than guessing when its input is missing.
 */

import type { VehicleStateV2 } from "../types";

export type Level = "ok" | "warn" | "bad" | "unknown";

const worst = (...levels: Level[]): Level => {
  if (levels.includes("bad")) return "bad";
  if (levels.includes("warn")) return "warn";
  if (levels.every((l) => l === "unknown")) return "unknown";
  return "ok";
};
export { worst as worstLevel };

/** 3D fix with HDOP ≤ 1.5 is good; 2D or poor HDOP is a warning; no fix is bad. */
export function gpsLevel(gps: VehicleStateV2["gps"]): Level {
  if (!gps) return "unknown";
  if (gps.fix < 2) return "bad";
  if (gps.fix === 2) return "warn";
  if (gps.hdop !== null && gps.hdop > 1.5) return "warn";
  if (gps.sats !== null && gps.sats < 6) return "warn";
  return "ok";
}

export interface BatteryThresholds {
  /** per-cell volts */
  cellWarn: number;
  cellBad: number;
  pctWarn: number;
  pctBad: number;
}

export const DEFAULT_BATTERY: BatteryThresholds = { cellWarn: 3.6, cellBad: 3.45, pctWarn: 30, pctBad: 15 };

/** Per-cell voltage when known (it is what failsafes act on), else percentage. */
export function batteryLevel(bat: VehicleStateV2["bat"], th: BatteryThresholds = DEFAULT_BATTERY): Level {
  if (!bat) return "unknown";
  if (bat.cellV !== null) {
    if (bat.cellV < th.cellBad) return "bad";
    if (bat.cellV < th.cellWarn) return "warn";
    return "ok";
  }
  if (bat.pct !== null) {
    if (bat.pct < th.pctBad) return "bad";
    if (bat.pct < th.pctWarn) return "warn";
    return "ok";
  }
  return "unknown";
}

/** Mission Planner colours EKF variance orange above 0.5 and red above 0.8. */
export function ekfLevel(ekf: VehicleStateV2["ekf"]): Level {
  if (!ekf) return "unknown";
  if (ekf.worst >= 0.8) return "bad";
  if (ekf.worst >= 0.5) return "warn";
  return "ok";
}

/** Below 30 m/s² is fine, above 60 almost always causes problems; any clipping is a warning. */
export function vibeLevel(vibe: VehicleStateV2["vibe"], clipsSeen = false): Level {
  if (!vibe) return "unknown";
  const peak = Math.max(vibe.x, vibe.y, vibe.z);
  if (peak > 60) return "bad";
  if (peak > 30 || clipsSeen) return "warn";
  return "ok";
}

/** Companion computer: under-voltage now is bad, seen since boot or hot is a warning. */
export function companionLevel(comp: VehicleStateV2["comp"]): Level {
  if (!comp) return "unknown";
  const t = comp.throttled ?? [];
  if (t.includes("under_voltage") || (comp.tempC !== null && comp.tempC >= 80)) return "bad";
  if (t.length > 0 || (comp.tempC !== null && comp.tempC >= 70)) return "warn";
  return "ok";
}

/** RC or telemetry-radio signal, as a percentage. */
export function rssiLevel(pct: number | null | undefined): Level {
  if (pct === null || pct === undefined) return "unknown";
  if (pct < 25) return "bad";
  if (pct < 50) return "warn";
  return "ok";
}

/** SiK RADIO_STATUS rssi is 0–254 (roughly 2 units per dB above noise). */
export function radioPct(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === 255) return null;
  return Math.round((raw / 254) * 100);
}

/** Pre-arm: failing messages or a clear SYS_STATUS bit decide; unknown otherwise. */
export function prearmLevel(health: VehicleStateV2["health"] | undefined): Level {
  if (!health) return "unknown";
  if (health.msgs.length > 0 || health.prearm === false) return "bad";
  if (health.bad.length > 0) return "warn";
  if (health.prearm === true) return "ok";
  return "unknown";
}

export function levelClass(level: Level): string {
  switch (level) {
    case "ok":
      return "text-status-online";
    case "warn":
      return "text-status-warning";
    case "bad":
      return "text-status-alarm";
    default:
      return "text-status-offline";
  }
}
