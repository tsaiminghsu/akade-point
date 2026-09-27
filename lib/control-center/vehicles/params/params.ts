/**
 * Parameters: file formats, ArduPilot metadata, comparison and the safety
 * checks behind the Safety page. Pure functions except fetchParamMeta.
 */

export type ParamTable = Record<string, [number, number]>; // name → [value, MAV_PARAM_TYPE]
export type ParamValues = Record<string, number>;

export function valuesOf(table: ParamTable): ParamValues {
  return Object.fromEntries(Object.entries(table).map(([k, [v]]) => [k, v]));
}

// ---- files -------------------------------------------------------------------

/**
 * Reads Mission Planner ("NAME,VALUE" or "NAME VALUE") and QGroundControl
 * ("sysid compid NAME VALUE type", tab separated) parameter files. Comment
 * lines start with #. Returns the values and the lines it could not read.
 */
export function parseParamFile(text: string): { values: ParamValues; bad: number[] } {
  const values: ParamValues = {};
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    let name: string | undefined;
    let value: string | undefined;
    if (parts.length >= 5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      [, , name, value] = parts;
    } else if (parts.length >= 2) {
      [name, value] = parts;
    }
    const num = Number(value);
    if (!name || !/^[A-Z][A-Z0-9_]{0,15}$/.test(name) || value === undefined || !Number.isFinite(num)) {
      bad.push(i + 1);
      return;
    }
    values[name] = num;
  });
  return { values, bad };
}

/** Mission Planner .param format, sorted by name. */
export function serializeParamFile(values: ParamValues, header?: string): string {
  const lines = header ? header.split("\n").map((l) => `# ${l}`) : [];
  for (const name of Object.keys(values).sort()) lines.push(`${name},${formatValue(values[name])}`);
  return `${lines.join("\n")}\n`;
}

export function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  // float32 values print with noise (0.1 → 0.100000001); 7 significant digits is what they hold.
  return String(Number(v.toPrecision(7)));
}

// ---- metadata ----------------------------------------------------------------

export interface ParamMeta {
  display: string;
  desc: string;
  units?: string;
  range?: [number, number];
  values?: Record<string, string>;
  bitmask?: Record<string, string>;
  reboot?: boolean;
  incr?: number;
  advanced?: boolean;
}

export type ParamMetaTable = Record<string, ParamMeta>;

interface PdefEntry {
  DisplayName?: string;
  Description?: string;
  Units?: string;
  Range?: { low?: string; high?: string };
  Values?: Record<string, string>;
  Bitmask?: Record<string, string>;
  RebootRequired?: string;
  Increment?: string;
  User?: string;
}

/** Flattens ArduPilot's apm.pdef.json (grouped by library) into name → meta. */
export function stripParamMeta(pdef: Record<string, Record<string, PdefEntry>>): ParamMetaTable {
  const out: ParamMetaTable = {};
  for (const group of Object.values(pdef)) {
    for (const [name, e] of Object.entries(group)) {
      const m: ParamMeta = { display: e.DisplayName ?? name, desc: e.Description ?? "" };
      if (e.Units) m.units = e.Units;
      const lo = Number(e.Range?.low);
      const hi = Number(e.Range?.high);
      if (e.Range && Number.isFinite(lo) && Number.isFinite(hi)) m.range = [lo, hi];
      if (e.Values && Object.keys(e.Values).length) m.values = e.Values;
      if (e.Bitmask && Object.keys(e.Bitmask).length) m.bitmask = e.Bitmask;
      if (e.RebootRequired === "True") m.reboot = true;
      const inc = Number(e.Increment);
      if (e.Increment && Number.isFinite(inc)) m.incr = inc;
      if (e.User === "Advanced") m.advanced = true;
      out[name] = m;
    }
  }
  return out;
}

export const PDEF_URL = {
  copter: "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.json",
  rover: "https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.json",
} as const;

const metaCache = new Map<string, Promise<ParamMetaTable | null>>();

/**
 * ArduPilot's published metadata for the current development version (it can
 * differ slightly from the firmware on the vehicle). Fetched by the browser —
 * the file is 2+ MB and served with CORS — once per page load.
 */
export function fetchParamMeta(family: keyof typeof PDEF_URL): Promise<ParamMetaTable | null> {
  let p = metaCache.get(family);
  if (!p) {
    p = fetch(PDEF_URL[family], { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? stripParamMeta(j) : null))
      .catch(() => null);
    metaCache.set(family, p);
  }
  return p;
}

export type ValueProblem = "belowRange" | "aboveRange" | "notInList" | "notInteger";

export function checkValue(meta: ParamMeta | undefined, value: number): ValueProblem | null {
  if (!meta) return null;
  if (meta.range) {
    if (value < meta.range[0]) return "belowRange";
    if (value > meta.range[1]) return "aboveRange";
  }
  if (meta.bitmask && !Number.isInteger(value)) return "notInteger";
  if (meta.values && !(String(value) in meta.values)) return "notInList";
  return null;
}

/** Bits set in a bitmask value, as their labels. */
export function bitLabels(meta: ParamMeta | undefined, value: number): string[] {
  if (!meta?.bitmask) return [];
  return Object.entries(meta.bitmask)
    .filter(([bit]) => (Math.round(value) & (1 << Number(bit))) !== 0)
    .map(([, label]) => label);
}

// ---- compare -----------------------------------------------------------------

export interface ParamDiff {
  name: string;
  /** on the vehicle (or the base snapshot) */
  current: number | null;
  /** in the file / other snapshot */
  other: number | null;
}

const f32 = (v: number) => Math.fround(v);

/** Parameters whose values differ, or that exist on only one side. */
export function diffParams(current: ParamValues, other: ParamValues): ParamDiff[] {
  const names = new Set([...Object.keys(current), ...Object.keys(other)]);
  const out: ParamDiff[] = [];
  for (const name of [...names].sort()) {
    const a = name in current ? current[name] : null;
    const b = name in other ? other[name] : null;
    if (a !== null && b !== null && f32(a) === f32(b)) continue;
    out.push({ name, current: a, other: b });
  }
  return out;
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---- safety ------------------------------------------------------------------

export interface SafetyGroup {
  key: string;
  params: string[];
}

/**
 * Curated safety parameters. ArduPilot 4.7 renamed many of them into SI units
 * (RTL_ALT cm → RTL_ALT_M m, WPNAV_SPEED → WP_SPD, SYSID_MYGCS → MAV_GCS_SYSID,
 * ARMING_CHECK → ARMING_SKIPCHK with the bits inverted…), so each group lists
 * both spellings and the page shows the ones the vehicle has. Checked against
 * ArduCopter and ArduRover 4.7.1 SITL (Rover kept its speed names).
 */
export const SAFETY_GROUPS: Record<"copter" | "rover", SafetyGroup[]> = {
  copter: [
    { key: "battery", params: ["BATT_MONITOR", "BATT_CAPACITY", "BATT_LOW_VOLT", "BATT_CRT_VOLT", "BATT_LOW_MAH", "BATT_CRT_MAH", "BATT_FS_LOW_ACT", "BATT_FS_CRT_ACT", "BATT_LOW_TIMER"] },
    { key: "radio", params: ["FS_THR_ENABLE", "FS_THR_VALUE", "FS_OPTIONS"] },
    { key: "gcs", params: ["FS_GCS_ENABLE", "FS_GCS_TIMEOUT", "SYSID_MYGCS", "MAV_GCS_SYSID"] },
    { key: "ekf", params: ["FS_EKF_ACTION", "FS_EKF_THRESH", "FS_VIBE_ENABLE"] },
    { key: "fence", params: ["FENCE_ENABLE", "FENCE_TYPE", "FENCE_ACTION", "FENCE_ALT_MAX", "FENCE_RADIUS", "FENCE_MARGIN"] },
    {
      key: "rtl",
      params: ["RTL_ALT", "RTL_ALT_M", "RTL_ALT_FINAL", "RTL_ALT_FINAL_M", "RTL_LOIT_TIME", "RTL_SPEED", "RTL_SPEED_MS", "LAND_SPEED", "LAND_SPD_MS", "WPNAV_SPEED", "WP_SPD"],
    },
    { key: "arming", params: ["ARMING_CHECK", "ARMING_SKIPCHK"] },
    { key: "gimbal", params: ["MNT1_TYPE", "MNT1_DEFLT_MODE", "MNT1_PITCH_MIN", "MNT1_PITCH_MAX", "MNT1_YAW_MIN", "MNT1_YAW_MAX", "MNT1_RC_RATE"] },
  ],
  rover: [
    { key: "battery", params: ["BATT_MONITOR", "BATT_CAPACITY", "BATT_LOW_VOLT", "BATT_CRT_VOLT", "BATT_FS_LOW_ACT", "BATT_FS_CRT_ACT", "BATT_LOW_TIMER"] },
    { key: "failsafe", params: ["FS_ACTION", "FS_TIMEOUT", "FS_THR_ENABLE", "FS_THR_VALUE", "FS_GCS_ENABLE", "FS_EKF_ACTION", "FS_OPTIONS"] },
    { key: "gcs", params: ["SYSID_MYGCS", "MAV_GCS_SYSID"] },
    { key: "fence", params: ["FENCE_ENABLE", "FENCE_TYPE", "FENCE_ACTION", "FENCE_RADIUS", "FENCE_MARGIN"] },
    { key: "nav", params: ["CRUISE_SPEED", "WP_SPEED", "WP_RADIUS", "WP_PIVOT_ANGLE", "RTL_SPEED"] },
    { key: "arming", params: ["ARMING_CHECK", "ARMING_SKIPCHK"] },
  ],
};

export interface ConfigIssue {
  level: "warn" | "info";
  /** i18n key under Gcs.params.check */
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Setup checks worth pointing out, from the parameter table and how the
 * companion is configured. Missing parameters are skipped, not assumed.
 */
export function configChecks(p: ParamValues, companion: { sysid: number; policy: "off" | "always" | "operator" | null }): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const has = (n: string) => n in p;
  const myGcs = has("MAV_GCS_SYSID") ? p.MAV_GCS_SYSID : has("SYSID_MYGCS") ? p.SYSID_MYGCS : null;
  const gcsFs = has("FS_GCS_ENABLE") ? p.FS_GCS_ENABLE : null;

  if (companion.policy === "operator") {
    if (myGcs !== null && myGcs !== companion.sysid) issues.push({ level: "warn", key: "operatorSysid", params: { sysid: companion.sysid, current: myGcs } });
    if (gcsFs === 0) issues.push({ level: "info", key: "operatorNoFs" });
  }
  if (companion.policy === "always" && gcsFs !== null && gcsFs > 0 && myGcs === companion.sysid) issues.push({ level: "warn", key: "alwaysMasks" });
  if (has("BATT_MONITOR") && p.BATT_MONITOR === 0) issues.push({ level: "warn", key: "noBattery" });
  if (has("BATT_LOW_VOLT") && p.BATT_LOW_VOLT > 0 && has("BATT_FS_LOW_ACT") && p.BATT_FS_LOW_ACT === 0) issues.push({ level: "info", key: "battNoAction" });
  if (has("ARMING_CHECK") && p.ARMING_CHECK === 0) issues.push({ level: "warn", key: "armingOff" });
  if (has("FENCE_ENABLE") && p.FENCE_ENABLE === 0) issues.push({ level: "info", key: "fenceOff" });
  if (has("FS_THR_ENABLE") && p.FS_THR_ENABLE === 0) issues.push({ level: "warn", key: "rcFsOff" });
  if (has("MNT1_TYPE")) {
    if (p.MNT1_TYPE === 4) issues.push({ level: "info", key: "storm32Mavlink" });
    if (p.MNT1_TYPE === 5) issues.push({ level: "info", key: "storm32Serial" });
  }
  if (has("SERIAL2_PROTOCOL") && p.SERIAL2_PROTOCOL !== 2) issues.push({ level: "info", key: "telem2NotMavlink2", params: { value: p.SERIAL2_PROTOCOL } });
  return issues;
}
