/**
 * What each mission command's parameters mean, for the flight-plan editor.
 * Labels are i18n keys under Gcs.plan.param; `null` means the slot is unused
 * and hidden. `loc` commands carry a position (lat/lon, and alt unless
 * `noAlt`). Numbers are ArduPilot's MAV_CMD ids.
 */

export type PlanKind = "mission" | "fence" | "rally";
export type VehicleFamily = "copter" | "rover";

export interface CmdMeta {
  id: number;
  name: string;
  /** i18n key under Gcs.plan.cmd */
  key: string;
  params: [string | null, string | null, string | null, string | null];
  loc: boolean;
  /** position without altitude (rover, fence) */
  noAlt?: boolean;
  /** navigation command (the vehicle goes somewhere / does something in place) */
  nav: boolean;
  vehicles: VehicleFamily[];
  kind: PlanKind;
  defaults?: Partial<Record<"p1" | "p2" | "p3" | "p4", number>>;
}

const BOTH: VehicleFamily[] = ["copter", "rover"];
const COPTER: VehicleFamily[] = ["copter"];

export const CMD_META: CmdMeta[] = [
  { id: 16, name: "WAYPOINT", key: "waypoint", params: ["holdS", "acceptM", "passM", "yawDeg"], loc: true, nav: true, vehicles: BOTH, kind: "mission" },
  { id: 82, name: "SPLINE_WAYPOINT", key: "spline", params: ["holdS", null, null, null], loc: true, nav: true, vehicles: COPTER, kind: "mission" },
  { id: 22, name: "TAKEOFF", key: "takeoff", params: [null, null, null, "yawDeg"], loc: true, nav: true, vehicles: COPTER, kind: "mission" },
  { id: 21, name: "LAND", key: "land", params: [null, null, null, "yawDeg"], loc: true, nav: true, vehicles: COPTER, kind: "mission" },
  { id: 20, name: "RETURN_TO_LAUNCH", key: "rtl", params: [null, null, null, null], loc: false, nav: true, vehicles: BOTH, kind: "mission" },
  { id: 17, name: "LOITER_UNLIM", key: "loiterUnlim", params: [null, null, "radiusM", null], loc: true, nav: true, vehicles: BOTH, kind: "mission" },
  { id: 18, name: "LOITER_TURNS", key: "loiterTurns", params: ["turns", null, "radiusM", null], loc: true, nav: true, vehicles: COPTER, kind: "mission", defaults: { p1: 1 } },
  { id: 19, name: "LOITER_TIME", key: "loiterTime", params: ["timeS", null, "radiusM", null], loc: true, nav: true, vehicles: BOTH, kind: "mission", defaults: { p1: 10 } },
  { id: 93, name: "NAV_DELAY", key: "navDelay", params: ["delayS", null, null, null], loc: false, nav: true, vehicles: BOTH, kind: "mission", defaults: { p1: 5 } },
  { id: 112, name: "CONDITION_DELAY", key: "condDelay", params: ["delayS", null, null, null], loc: false, nav: false, vehicles: BOTH, kind: "mission", defaults: { p1: 5 } },
  { id: 114, name: "CONDITION_DISTANCE", key: "condDistance", params: ["distanceM", null, null, null], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 115, name: "CONDITION_YAW", key: "condYaw", params: ["yawDeg", "rateDegS", "direction", "relative"], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 177, name: "DO_JUMP", key: "doJump", params: ["jumpSeq", "repeat", null, null], loc: false, nav: false, vehicles: BOTH, kind: "mission", defaults: { p1: 1, p2: 1 } },
  { id: 178, name: "DO_CHANGE_SPEED", key: "changeSpeed", params: ["speedType", "speedMs", "throttlePct", null], loc: false, nav: false, vehicles: BOTH, kind: "mission", defaults: { p1: 1, p2: 5, p3: -1 } },
  { id: 181, name: "DO_SET_RELAY", key: "setRelay", params: ["relay", "onOff", null, null], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 183, name: "DO_SET_SERVO", key: "setServo", params: ["servo", "pwm", null, null], loc: false, nav: false, vehicles: BOTH, kind: "mission", defaults: { p1: 9, p2: 1500 } },
  { id: 195, name: "DO_SET_ROI_LOCATION", key: "roi", params: [null, null, null, null], loc: true, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 201, name: "DO_SET_ROI", key: "roiLegacy", params: ["roiMode", null, null, null], loc: true, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 197, name: "DO_SET_ROI_NONE", key: "roiNone", params: [null, null, null, null], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 205, name: "DO_MOUNT_CONTROL", key: "mountControl", params: ["pitchDeg", "rollDeg", "yawDeg", null], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 1000, name: "DO_GIMBAL_MANAGER_PITCHYAW", key: "gimbalPitchYaw", params: ["pitchDeg", "yawDeg", "pitchRate", "yawRate"], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 206, name: "DO_SET_CAM_TRIGG_DIST", key: "camTriggDist", params: ["distanceM", null, "triggerOnce", null], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  { id: 215, name: "DO_SET_RESUME_REPEAT_DIST", key: "resumeRepeat", params: ["distanceM", null, null, null], loc: false, nav: false, vehicles: BOTH, kind: "mission" },
  // Fence (mission type 1). param1 = vertex count / radius.
  { id: 5001, name: "FENCE_POLYGON_VERTEX_INCLUSION", key: "fencePolyIn", params: ["vertexCount", null, null, null], loc: true, noAlt: true, nav: false, vehicles: BOTH, kind: "fence" },
  { id: 5002, name: "FENCE_POLYGON_VERTEX_EXCLUSION", key: "fencePolyOut", params: ["vertexCount", null, null, null], loc: true, noAlt: true, nav: false, vehicles: BOTH, kind: "fence" },
  { id: 5003, name: "FENCE_CIRCLE_INCLUSION", key: "fenceCircleIn", params: ["radiusM", null, null, null], loc: true, noAlt: true, nav: false, vehicles: BOTH, kind: "fence" },
  { id: 5004, name: "FENCE_CIRCLE_EXCLUSION", key: "fenceCircleOut", params: ["radiusM", null, null, null], loc: true, noAlt: true, nav: false, vehicles: BOTH, kind: "fence" },
  { id: 5000, name: "FENCE_RETURN_POINT", key: "fenceReturn", params: [null, null, null, null], loc: true, nav: false, vehicles: BOTH, kind: "fence" },
  // Rally (mission type 2).
  { id: 5100, name: "RALLY_POINT", key: "rally", params: [null, null, null, null], loc: true, nav: false, vehicles: BOTH, kind: "rally" },
];

const BY_ID = new Map(CMD_META.map((m) => [m.id, m]));

export function cmdMeta(id: number): CmdMeta | undefined {
  return BY_ID.get(id);
}

/** Commands offered in the editor for this plan kind and vehicle. */
export function commandsFor(kind: PlanKind, vehicle: VehicleFamily): CmdMeta[] {
  return CMD_META.filter((m) => m.kind === kind && m.vehicles.includes(vehicle));
}

/** True when the item carries a meaningful position. */
export function hasLocation(cmd: number): boolean {
  return cmdMeta(cmd)?.loc ?? false;
}

export function isNav(cmd: number): boolean {
  return cmdMeta(cmd)?.nav ?? false;
}

/** MAV_FRAME values offered for mission items. */
export const FRAMES = [
  { id: 3, key: "relative" },
  { id: 0, key: "absolute" },
  { id: 10, key: "terrain" },
] as const;

export const MISSION_TYPE: Record<PlanKind, 0 | 1 | 2> = { mission: 0, fence: 1, rally: 2 };
