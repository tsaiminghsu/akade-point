/**
 * Logic behind the QGroundControl-style Fly view: the toolbar's main status,
 * which tool-strip actions apply right now, and the compass geometry. Kept
 * free of React so it can be unit tested.
 */

import { ESP32_ROVER_MODES, MODES_BY_TYPE, PX4_MODES } from "../constants";
import type { VehicleStateV2, VehicleType } from "../types";
import { bearingDeg, distanceM, wrap360 } from "./geo";
import type { Level } from "./health";

export type MainStatusKey = "noData" | "linkLost" | "fcLost" | "notReady" | "ready" | "armed" | "flying" | "driving";

/**
 * QGC's main status indicator: "Ready To Fly", "Not Ready", "Armed",
 * "Flying", "Communication Lost". Flying is inferred (ArduPilot does not send
 * a landed state here): armed and either above 1 m or moving.
 */
export function mainStatus(state: VehicleStateV2 | null, stale: boolean, rover: boolean): { key: MainStatusKey; level: Level } {
  if (!state) return { key: "noData", level: "unknown" };
  if (stale) return { key: "linkLost", level: "bad" };
  if (!state.fc.ok) return { key: "fcLost", level: "bad" };
  if (state.armed) {
    const moving = (state.gs ?? 0) > (rover ? 0.3 : 0.5);
    const up = !rover && (state.pos?.rel ?? 0) > 1;
    if (up || moving) return { key: rover ? "driving" : "flying", level: "ok" };
    return { key: "armed", level: "warn" };
  }
  if (state.health.msgs.length > 0 || state.health.prearm === false) return { key: "notReady", level: "warn" };
  return { key: "ready", level: "ok" };
}

export type GuidedKind = "arm" | "disarm" | "takeoff" | "land" | "rtl" | "pause" | "missionStart" | "missionResume" | "missionPause" | "flyTo" | "setHome";

export interface StripButton {
  kind: "arm" | "disarm" | "takeoff" | "land" | "rtl" | "pause" | "mission";
  /** false: shown dimmed (QGC hides it; showing it teaches where it will be) */
  enabled: boolean;
}

/**
 * The left tool strip, top to bottom. Copters get takeoff and land; the
 * mission button appears only when the vehicle runs missions. Everything is
 * dimmed while the data is stale: nothing sent now would be acting on what
 * the vehicle is really doing.
 */
export function stripButtons(state: VehicleStateV2 | null, rover: boolean, stale = false): StripButton[] {
  const armed = state?.armed === true && !stale;
  const known = state !== null && state.armed !== null && !stale;
  const flying = mainStatus(state, false, rover).key === "flying";
  const hasMission = !state || state.caps.includes("mission");
  const out: StripButton[] = [armed ? { kind: "disarm", enabled: known && !flying } : { kind: "arm", enabled: known }];
  if (!rover) {
    out.push({ kind: "takeoff", enabled: known && !flying });
    out.push({ kind: "land", enabled: armed });
  }
  out.push({ kind: "rtl", enabled: armed }, { kind: "pause", enabled: armed });
  if (hasMission) out.push({ kind: "mission", enabled: known });
  return out;
}

/**
 * What the mission button does now: pause a running mission, continue one
 * this page paused, otherwise start. ArduPilot's MISSION_START carries on from
 * the current waypoint (MIS_RESTART=0), so "start" after a stop part-way is a
 * continue; the caller words it that way when the current waypoint is past 1.
 * A pause leaves the mode in AUTO, so only the last command tells a paused
 * mission from a running one.
 */
export function missionAction(state: VehicleStateV2 | null, lastMissionCommand: string | null = null): "missionPause" | "missionResume" | "missionStart" {
  const running = state?.armed === true && (state.mode === "AUTO" || state.mode === "MISSION");
  if (running) return lastMissionCommand === "mission_pause" ? "missionResume" : "missionPause";
  return "missionStart";
}

/** Flight modes the mode menu offers for this vehicle and autopilot. */
export function modesFor(type: VehicleType, state: VehicleStateV2 | null): readonly string[] {
  if (state?.veh?.ap === "px4") return PX4_MODES;
  if (state?.veh?.ap === "generic" && type === "rover") return ESP32_ROVER_MODES;
  return MODES_BY_TYPE[type];
}

/**
 * Where a bearing sits on a heading-up compass ring: degrees clockwise from
 * the top of the dial.
 */
export function ringAngle(bearing: number, heading: number): number {
  return wrap360(bearing - heading);
}

/** Bearing and distance from the vehicle to home, for the compass's home marker. */
export function homeVector(state: VehicleStateV2 | null): { bearing: number; dist: number } | null {
  if (!state?.pos || !state.home) return null;
  const dist = distanceM(state.pos.lat, state.pos.lon, state.home.lat, state.home.lon);
  if (dist < 1) return null;
  return { bearing: bearingDeg(state.pos.lat, state.pos.lon, state.home.lat, state.home.lon), dist };
}
