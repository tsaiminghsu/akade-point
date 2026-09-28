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
/** Upper bound on a stored state snapshot, as serialized JSON. */
export const MAX_STATE_BYTES = 16 * 1024;

/** Per-command timeout the companion must honour (ms). */
export const COMMAND_TIMEOUT_MS: Record<VehicleCommandType, number> = {
  arm: 10_000,
  disarm: 10_000,
  set_mode: 10_000,
  land: 10_000,
  hold: 10_000,
  goto: 10_000,
  change_alt: 10_000,
  change_speed: 10_000,
  rtl: 10_000,
  mission_start: 10_000,
  mission_pause: 10_000,
  mission_resume: 10_000,
  mission_set_current: 10_000,
  set_home: 10_000,
  run_prearm: 10_000,
  reboot: 10_000,
  takeoff: 30_000,
  mission_upload: 90_000,
  mission_download: 90_000,
  mission_clear: 20_000,
  param_get: 60_000,
  param_set: 90_000,
  param_fetch: 240_000,
  video_record: 10_000,
  gimbal_pitchyaw: 10_000,
  gimbal_mode: 10_000,
  roi_location: 10_000,
  roi_none: 10_000,
  payload_relay: 10_000,
  payload_pulse: 10_000,
  payload_servo: 10_000,
  log_list: 30_000,
  // Over a telemetry radio (~5 kB/s) a 20 MB log takes about an hour.
  log_download: 3 * 60 * 60_000,
  log_cancel: 10_000,
};

/**
 * Flight modes offered per vehicle type (ArduPilot names, as pymavlink and
 * Mission Planner spell them). Ordered by how often people switch to them.
 */
export const COPTER_MODES = [
  "STABILIZE",
  "ALT_HOLD",
  "LOITER",
  "POSHOLD",
  "GUIDED",
  "AUTO",
  "RTL",
  "SMART_RTL",
  "LAND",
  "BRAKE",
  "CIRCLE",
  "ACRO",
  "SPORT",
  "DRIFT",
  "AUTOTUNE",
  "FOLLOW",
  "ZIGZAG",
  "FLOWHOLD",
  "GUIDED_NOGPS",
  "AUTO_RTL",
  "THROW",
] as const;
export const ROVER_MODES = [
  "MANUAL",
  "HOLD",
  "STEERING",
  "ACRO",
  "GUIDED",
  "AUTO",
  "RTL",
  "SMART_RTL",
  "LOITER",
  "FOLLOW",
  "SIMPLE",
  "CIRCLE",
  "DOCK",
] as const;
/** PX4 is supported at a basic level; these are pymavlink's PX4 mode names. */
export const PX4_MODES = ["MANUAL", "STABILIZED", "ALTCTL", "POSCTL", "LOITER", "MISSION", "RTL", "LAND", "TAKEOFF", "OFFBOARD"] as const;

export const MODES_BY_TYPE: Record<VehicleType, readonly string[]> = {
  drone: COPTER_MODES,
  rover: ROVER_MODES,
};

const COMMON_COMMANDS: VehicleCommandType[] = [
  "arm",
  "disarm",
  "set_mode",
  "hold",
  "goto",
  "change_speed",
  "rtl",
  "mission_start",
  "mission_pause",
  "mission_resume",
  "mission_set_current",
  "mission_upload",
  "mission_download",
  "mission_clear",
  "set_home",
  "run_prearm",
  "reboot",
  "param_get",
  "param_set",
  "param_fetch",
  "video_record",
  "gimbal_pitchyaw",
  "gimbal_mode",
  "roi_location",
  "roi_none",
  "payload_relay",
  "payload_pulse",
  "payload_servo",
  "log_list",
  "log_download",
  "log_cancel",
];

/** The ESP32 rover base (MAV_AUTOPILOT_GENERIC) implements only these, with ArduPilot Rover's numbers. */
export const ESP32_ROVER_MODES = ["MANUAL", "HOLD", "GUIDED"] as const;

/** Commands offered per vehicle type. Rovers do not take off, land or climb. */
export const COMMANDS_BY_TYPE: Record<VehicleType, VehicleCommandType[]> = {
  drone: [...COMMON_COMMANDS, "takeoff", "land", "change_alt"],
  rover: COMMON_COMMANDS,
};

/** Browser polls the GCS live endpoint at this rate over the cloud link. */
export const GCS_LIVE_POLL_MS = 1000;
/** A GCS page that polled within this window counts as an operator watching. */
export const OPERATOR_PRESENT_MS = 5000;
/** STATUSTEXT history retention (events table). */
export const VEHICLE_EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Max STATUSTEXT messages accepted per telemetry POST. */
export const MAX_EVENTS_PER_POST = 50;

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
