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
 * Telemetry snapshot, contract v1: the original compact shape. Every field is a
 * number, so a missing reading arrives as 0 — kept only for companions that
 * have not been upgraded. All units are SI-ish: metres, m/s, degrees, volts, amps.
 */
export interface VehicleStateV1 {
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

export type VehicleClass = "copter" | "rover" | "plane" | "other";
export type AutopilotFamily = "ardupilot" | "px4" | "generic" | "other";
export type VehicleCap = "mission" | "fence" | "rally" | "params" | "command_int" | "manual" | "gimbal" | "logs";

/**
 * Telemetry snapshot, contract v2 (the web ground station). Anything the
 * companion does not currently know is null — never 0 — and a value is only
 * reported while the MAVLink message behind it is fresh.
 */
export interface VehicleStateV2 {
  v: 2;
  /** server-aligned epoch ms when the companion built the snapshot */
  t: number;
  /** Pi ⇄ flight controller link: heartbeat seen recently, its age (s), pinned [sysid, compid] */
  fc: { ok: boolean; age: number | null; id: [number, number] | null };
  veh: { cls: VehicleClass; ap: AutopilotFamily; mavType: number } | null;
  armed: boolean | null;
  mode: string | null;
  sys: string | null;
  /** attitude, degrees; y is 0-360 */
  att: { r: number; p: number; y: number } | null;
  /** cellV is the lowest cell (smart battery) or pack/cells when cellAvg */
  bat: {
    v: number | null;
    a: number | null;
    pct: number | null;
    mah: number | null;
    cells: number | null;
    cellV: number | null;
    cellAvg: boolean;
  } | null;
  gps: { fix: number; sats: number | null; hdop: number | null } | null;
  /** alt is AMSL, rel is above home, metres */
  pos: { lat: number; lon: number; alt: number; rel: number } | null;
  home: { lat: number; lon: number; alt: number } | null;
  hdg: number | null;
  gs: number | null;
  as: number | null;
  vs: number | null;
  /** throttle % */
  thr: number | null;
  /** mission progress; dist to the active waypoint (m) and cross-track error (m) */
  wp: { cur: number; n: number | null; dist: number | null; xt: number | null } | null;
  /** EKF variances (0.5 caution, 0.8 bad in Mission Planner) */
  ekf: { flags: number; vel: number; posH: number; posV: number; compass: number; terrain: number; worst: number } | null;
  /** vibration m/s/s (≤30 good, >60 bad) and accelerometer clip counts */
  vibe: { x: number; y: number; z: number; clip: [number, number, number] } | null;
  rssi: {
    /** RC receiver RSSI % */
    rc: number | null;
    /** telemetry radio (SiK / DroneBridge RADIO_STATUS) */
    radio: { rssi: number; remrssi: number; noise: number; remnoise: number; rxerr: number; fixed: number } | null;
  };
  /** prearm: SYS_STATUS pre-arm bit (null if not reported); bad: unhealthy sensors; msgs: current PreArm/Arm texts */
  health: { prearm: boolean | null; bad: string[]; msgs: string[] };
  fence: { breach: boolean; count: number; type: number } | null;
  wind: { dir: number; spd: number } | null;
  /** companion computer health */
  comp: {
    tempC: number | null;
    load: number | null;
    cpus: number | null;
    diskFreeMb: number | null;
    throttled: string[] | null;
    uptimeS: number;
  } | null;
  caps: VehicleCap[];
  /** others: other GCS heartbeats seen; policy/hb: the companion's own GCS heartbeat */
  gcs: { others: number; policy?: "off" | "always" | "operator"; hb?: boolean };
  fw: string | null;
}

export type VehicleState = VehicleStateV1 | VehicleStateV2;

/**
 * The version-independent numbers the fleet list, history rows and older UI
 * read. Built by summarize(); null means unknown.
 */
export interface VehicleSummary {
  armed: boolean | null;
  mode: string | null;
  batPct: number | null;
  batV: number | null;
  fix: number | null;
  sats: number | null;
  hdop: number | null;
  pos: { lat: number; lon: number; alt: number; rel: number } | null;
  hdg: number | null;
  gs: number | null;
  vs: number | null;
  wp: { cur: number; n: number | null } | null;
  fw: string | null;
  sys: string | null;
  /** false when the companion reports it cannot hear the flight controller (v2 only) */
  fcOk: boolean;
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
  /** companion WebSocket URL for the direct link (wss:// from an https page) */
  directUrl: string;
  /** MediaMTX WebRTC (WHEP) URL for live video */
  videoUrl: string;
  createdAt: number;
  updatedAt: number;
}

export type VehicleCommandType =
  | "arm"
  | "disarm"
  | "set_mode"
  | "takeoff"
  | "land"
  | "hold"
  | "goto"
  | "change_alt"
  | "change_speed"
  | "rtl"
  | "mission_start"
  | "mission_pause"
  | "mission_resume"
  | "mission_set_current"
  | "mission_upload"
  | "mission_download"
  | "mission_clear"
  | "set_home"
  | "run_prearm"
  | "reboot"
  | "param_get"
  | "param_set";

/** Where a command was issued: through this server, or straight to the
 *  companion over the direct link (then reported back for the log). */
export type VehicleCommandVia = "cloud" | "direct";

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
  /** absent = "cloud" */
  via?: VehicleCommandVia;
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
  /** epoch ms (server clock) after which the companion must not start it */
  exp: number;
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

/** Which of the autopilot's three plans a stored list is: the flight mission,
 *  the geofence, or rally points (MAVLink mission_type 0/1/2). */
export type MissionKind = "mission" | "fence" | "rally";

export interface VehicleMission {
  id: string;
  vehicleId: string;
  name: string;
  items: MissionItem[];
  source: MissionSource;
  /** absent on rows saved before fences and rally points existed = "mission" */
  kind?: MissionKind;
  createdAt: number;
  updatedAt: number;
}

/** A flattened telemetry history row (what the telemetry table stores).
 *  Only snapshots with a position are stored; other readings may be null. */
export interface TelemetryPoint {
  vehicleId: string;
  t: number;
  lat: number;
  lon: number;
  alt: number;
  rel: number;
  hdg: number | null;
  gs: number | null;
  batPct: number | null;
  batV: number | null;
  mode: string | null;
  armed: boolean | null;
  sats: number | null;
  fix: number | null;
  expiresAt?: number;
}

/** A STATUSTEXT message from the vehicle, as stored in the events table. */
export interface VehicleEvent {
  vehicleId: string;
  /** sort key: zero-padded t + "#" + companion seq; also the paging cursor */
  sk: string;
  t: number;
  /** MAV_SEVERITY 0 (emergency) … 7 (debug) */
  sev: number;
  text: string;
  /** MAVLink component that sent it (1 = autopilot, 154 = gimbal, …) */
  comp: number;
  expiresAt?: number;
}
