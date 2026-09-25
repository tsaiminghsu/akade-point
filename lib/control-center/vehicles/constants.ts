import type { VehicleCommandType, VehicleType } from "./types";

/** Link-state thresholds, derived from lastSeenAt. */
export const VEHICLE_ONLINE_MS = 10_000;
export const VEHICLE_STALE_MS = 60_000;

/** Browser poll interval for the vehicles list and open drawer. */
export const VEHICLE_POLL_MS = 2000;

/** History retention (telemetry table) and command retention. */
export const VEHICLE_HISTORY_TTL_SECONDS = 7 * 24 * 60 * 60;
export const VEHICLE_COMMAND_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Max mission items accepted per mission, and max history points per POST. */
export const MAX_MISSION_ITEMS = 500;
export const MAX_HISTORY_POINTS_PER_POST = 60;

/** Per-command timeout the companion must honour (ms). */
export const COMMAND_TIMEOUT_MS: Record<VehicleCommandType, number> = {
  arm: 10_000,
  disarm: 10_000,
  set_mode: 10_000,
  goto: 10_000,
  rtl: 10_000,
  mission_start: 10_000,
  takeoff: 30_000,
  mission_upload: 60_000,
  mission_download: 60_000,
};

/** Flight modes selectable per vehicle type (ArduPilot). */
export const COPTER_MODES = ["STABILIZE", "GUIDED", "AUTO", "RTL", "LAND", "LOITER"] as const;
export const ROVER_MODES = ["MANUAL", "GUIDED", "AUTO", "RTL", "HOLD"] as const;

export const MODES_BY_TYPE: Record<VehicleType, readonly string[]> = {
  drone: COPTER_MODES,
  rover: ROVER_MODES,
};

/** Commands offered per vehicle type. takeoff is copter-only. */
export const COMMANDS_BY_TYPE: Record<VehicleType, VehicleCommandType[]> = {
  drone: ["arm", "disarm", "set_mode", "takeoff", "goto", "rtl", "mission_start", "mission_upload", "mission_download"],
  rover: ["arm", "disarm", "set_mode", "goto", "rtl", "mission_start", "mission_upload", "mission_download"],
};

/** MAV_CMD numeric id → short label, for the mission editor's command column. */
export const MAV_CMD_LABELS: Record<number, string> = {
  16: "NAV_WAYPOINT",
  17: "NAV_LOITER_UNLIM",
  18: "NAV_LOITER_TURNS",
  19: "NAV_LOITER_TIME",
  20: "NAV_RETURN_TO_LAUNCH",
  21: "NAV_LAND",
  22: "NAV_TAKEOFF",
  82: "NAV_SPLINE_WAYPOINT",
  93: "NAV_DELAY",
  177: "DO_JUMP",
  178: "DO_CHANGE_SPEED",
  183: "DO_SET_SERVO",
  201: "DO_SET_ROI",
  206: "DO_SET_CAM_TRIGG_DIST",
};

/** MAV_FRAME numeric id → label, for the mission editor's frame column. */
export const MAV_FRAME_LABELS: Record<number, string> = {
  0: "GLOBAL",
  3: "GLOBAL_REL_ALT",
  10: "GLOBAL_TERRAIN_ALT",
};

/** A blank home row (seq 0) used when starting a fresh mission. */
export const DEFAULT_HOME_ITEM = {
  seq: 0,
  cur: 1,
  frame: 0,
  cmd: 16,
  p1: 0,
  p2: 0,
  p3: 0,
  p4: 0,
  lat: 0,
  lon: 0,
  alt: 0,
  ac: 1,
} as const;
