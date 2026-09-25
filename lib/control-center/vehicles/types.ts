/**
 * Vehicle (drone / rover) domain types for the MissionPlanner-integration
 * module. Numbers that mirror MAVLink (command ids, frames, coordinates) are
 * kept as raw numbers; human labels live only in the UI (see constants).
 *
 * As with the machines module, the client types here and the CC* server types
 * in lib/dynamo/cc-vehicle-*.ts are separate structural copies on purpose.
 */

export type VehicleType = "drone" | "rover";

/** Derived from lastSeenAt at read time, never stored. */
export type VehicleLinkState = "online" | "stale" | "offline";

/**
 * A single telemetry snapshot. This is the exact JSON the companion sends over
 * MQTT or HTTPS, so keys are short and the whole object stays under ~1 KB for
 * ESP32 friendliness. All units are SI-ish: metres, m/s, degrees, volts, amps.
 */
export interface VehicleState {
  v: 1;
  /** epoch ms on the companion when the sample was taken */
  t: number;
  armed: boolean;
  /** ArduPilot flight-mode name, e.g. "GUIDED" */
  mode: string;
  /** MAV_STATE name, e.g. "ACTIVE" | "STANDBY" | "CRITICAL" */
  sys: string;
  bat: { pct: number; v: number; a: number };
  /** fix: 0 none, 2 2D, 3 3D, 4 DGPS, 5 RTK float, 6 RTK fixed */
  gps: { fix: number; sats: number; hdop: number };
  pos: { lat: number; lon: number; alt: number; rel: number };
  /** heading degrees 0-360 */
  hdg: number;
  /** groundspeed m/s */
  gs: number;
  /** climb rate m/s (+ up) */
  vs: number;
  /** current/total mission waypoint */
  wp: { cur: number; n: number };
  /** autopilot version string, e.g. "ArduCopter V4.5.7" */
  fw: string;
}

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  /** stable id chosen by the operator; also the IoT Thing name in prod */
  companionId: string;
  notes: string;
  state: VehicleState | null;
  stateAt: number | null;
  lastSeenAt: number | null;
  /** derived from lastSeenAt; present on API responses, not stored */
  linkState: VehicleLinkState;
  createdAt: number;
  updatedAt: number;
}

export type VehicleCommandType =
  | "arm"
  | "disarm"
  | "set_mode"
  | "takeoff"
  | "goto"
  | "rtl"
  | "mission_start"
  | "mission_upload"
  | "mission_download";

export type VehicleCommandStatus = "pending" | "sent" | "acked" | "failed" | "timeout";

/** Command as stored/served to the browser. `args` shape depends on `type`. */
export interface VehicleCommand {
  id: string;
  vehicleId: string;
  type: VehicleCommandType;
  args: Record<string, unknown>;
  status: VehicleCommandStatus;
  timeoutMs: number;
  issuedBy: string;
  createdAt: number;
  sentAt?: number;
  ackedAt?: number;
  /** MAV_RESULT name or a companion-side reason code */
  code?: string;
  msg?: string;
  result?: Record<string, unknown>;
  /** true when an ack arrived after the command had already been marked timeout */
  late?: boolean;
  expiresAt?: number;
}

/** The compact command envelope pushed to the companion (MQTT or piggybacked). */
export interface VehicleCommandMsg {
  v: 1;
  id: string;
  type: VehicleCommandType;
  args: Record<string, unknown>;
  /** issued-at epoch ms */
  iat: number;
  /** timeout ms the companion should honour */
  to: number;
}

/** The compact ack the companion posts back. */
export interface VehicleAck {
  v: 1;
  id: string;
  st: "acked" | "failed";
  code: string;
  msg?: string;
  t: number;
  res?: Record<string, unknown>;
}

/**
 * A MAVLink mission item in canonical numeric form (matches MISSION_ITEM_INT
 * fields, but lat/lon/alt as floats). seq 0 is the home item and is kept so a
 * `.waypoints` file round-trips.
 */
export interface MissionItem {
  seq: number;
  /** 1 if this is the current item */
  cur: number;
  /** MAV_FRAME, e.g. 3 = GLOBAL_RELATIVE_ALT */
  frame: number;
  /** MAV_CMD, e.g. 16 = NAV_WAYPOINT, 22 = NAV_TAKEOFF */
  cmd: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  lat: number;
  lon: number;
  alt: number;
  /** autocontinue */
  ac: number;
}

export type MissionSource = "editor" | "import" | "download";

export interface VehicleMission {
  id: string;
  vehicleId: string;
  name: string;
  items: MissionItem[];
  source: MissionSource;
  createdAt: number;
  updatedAt: number;
}

/** A flattened telemetry history row (what the telemetry table stores). */
export interface TelemetryPoint {
  vehicleId: string;
  t: number;
  lat: number;
  lon: number;
  alt: number;
  rel: number;
  hdg: number;
  gs: number;
  batPct: number;
  batV: number;
  mode: string;
  armed: boolean;
  sats: number;
  fix: number;
  expiresAt?: number;
}
