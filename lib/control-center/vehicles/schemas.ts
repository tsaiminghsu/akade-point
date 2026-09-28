import { z } from "zod";

import { MAX_EVENTS_PER_POST, MAX_HISTORY_POINTS_PER_POST, MAX_MISSION_ITEMS, MAX_STATE_BYTES } from "./constants";

/** Telemetry snapshot, contract v1 (companion → server). Mirrors VehicleStateV1. */
export const vehicleStateV1Schema = z.object({
  v: z.literal(1),
  t: z.number(),
  armed: z.boolean(),
  mode: z.string().min(1),
  sys: z.string().min(1),
  bat: z.object({ pct: z.number(), v: z.number(), a: z.number() }),
  gps: z.object({ fix: z.number().int(), sats: z.number().int(), hdop: z.number() }),
  pos: z.object({ lat: z.number(), lon: z.number(), alt: z.number(), rel: z.number() }),
  hdg: z.number(),
  gs: z.number(),
  vs: z.number(),
  wp: z.object({ cur: z.number().int(), n: z.number().int() }),
  fw: z.string(),
});

const num = z.number().nullable();
const latLon = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const payloadIndex = z.number().int().min(0).max(15);
/** MAVLink component of the payload node; 25 (MAV_COMP_ID_USER1) by default. */
const payloadComp = z.number().int().min(1).max(255).optional();

/**
 * Telemetry snapshot, contract v2. The fields the server itself reads are
 * typed; the object is loose so a newer companion's extra fields reach the
 * ground station without a server deploy (the route caps the total size).
 */
export const vehicleStateV2Schema = z.looseObject({
  v: z.literal(2),
  t: z.number(),
  fc: z.looseObject({ ok: z.boolean(), age: num, id: z.tuple([z.number(), z.number()]).nullable() }),
  veh: z
    .looseObject({ cls: z.enum(["copter", "rover", "plane", "other"]), ap: z.enum(["ardupilot", "px4", "generic", "other"]), mavType: z.number() })
    .nullable(),
  armed: z.boolean().nullable(),
  mode: z.string().nullable(),
  sys: z.string().nullable(),
  bat: z.looseObject({ v: num, a: num, pct: num }).nullable(),
  gps: z.looseObject({ fix: z.number().int(), sats: num, hdop: num }).nullable(),
  pos: z.looseObject({ ...latLon, alt: z.number(), rel: z.number() }).nullable(),
  hdg: num,
  gs: num,
  vs: num,
  wp: z.looseObject({ cur: z.number().int(), n: num }).nullable(),
  health: z.looseObject({ prearm: z.boolean().nullable(), bad: z.array(z.string()), msgs: z.array(z.string()) }),
  caps: z.array(z.string()),
  fw: z.string().nullable(),
});

export const vehicleStateSchema = z.discriminatedUnion("v", [vehicleStateV1Schema, vehicleStateV2Schema]);

/** A STATUSTEXT forwarded by the companion. */
export const statusMessageSchema = z.object({
  seq: z.number().int().min(0),
  t: z.number(),
  sev: z.number().int().min(0).max(7),
  text: z.string().min(1).max(500),
  comp: z.number().int().min(0).max(255),
});

/** A command the companion ran for the direct link, reported for the log. */
export const directAuditSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(40),
  args: z.record(z.string(), z.unknown()),
  st: z.enum(["acked", "failed"]),
  code: z.string().max(80),
  msg: z.string().max(500).optional(),
  sub: z.string().max(100),
  createdAt: z.number(),
  ackedAt: z.number(),
  res: z.record(z.string(), z.unknown()).optional(),
});

export const telemetryPostSchema = z
  .object({
    state: vehicleStateSchema,
    history: z.array(vehicleStateSchema).max(MAX_HISTORY_POINTS_PER_POST).optional(),
    msgs: z.array(statusMessageSchema).max(MAX_EVENTS_PER_POST).optional(),
    audit: z.array(directAuditSchema).max(50).optional(),
  })
  .refine((body) => JSON.stringify(body.state).length <= MAX_STATE_BYTES, { message: "state too large" });

export const vehicleCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["drone", "rover"]),
  companionId: z.string().min(1),
  notes: z.string().optional(),
});

/** "" clears the field; otherwise it must be the right kind of URL. */
const optionalUrl = (protocols: RegExp) =>
  z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || (protocols.test(v) && URL.canParse(v)), "Invalid URL")
    .optional();

export const vehiclePatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.enum(["drone", "rover"]).optional(),
    companionId: z.string().min(1).optional(),
    notes: z.string().optional(),
    directUrl: optionalUrl(/^wss?:\/\//),
    videoUrl: optionalUrl(/^https?:\/\//),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

const mtype = z.union([z.literal(0), z.literal(1), z.literal(2)]).optional();
const paramName = z.string().regex(/^[A-Z0-9_]{1,16}$/, "ArduPilot parameter names are up to 16 A-Z, 0-9, _");

/**
 * Command request from the browser. Discriminated on `type` so each command
 * validates only the args it needs. The route additionally checks the command
 * is allowed for the vehicle's type and that the mode is in range.
 */
export const commandRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("arm") }),
  z.object({ type: z.literal("disarm"), force: z.boolean().optional() }),
  z.object({ type: z.literal("set_mode"), mode: z.string().min(1) }),
  z.object({ type: z.literal("takeoff"), alt: z.number().positive().max(1000) }),
  z.object({ type: z.literal("land") }),
  z.object({ type: z.literal("hold") }),
  z.object({ type: z.literal("goto"), ...latLon, alt: z.number().min(-100).max(10_000) }),
  z.object({ type: z.literal("change_alt"), alt: z.number().min(0).max(10_000) }),
  z.object({ type: z.literal("change_speed"), speed: z.number().positive().max(100) }),
  z.object({ type: z.literal("rtl") }),
  z.object({ type: z.literal("mission_start") }),
  z.object({ type: z.literal("mission_pause") }),
  z.object({ type: z.literal("mission_resume") }),
  z.object({ type: z.literal("mission_set_current"), seq: z.number().int().min(0).max(MAX_MISSION_ITEMS) }),
  z.object({ type: z.literal("mission_upload"), missionId: z.string().min(1) }),
  z.object({ type: z.literal("mission_download"), mtype }),
  z.object({ type: z.literal("mission_clear"), mtype }),
  z
    .object({
      type: z.literal("set_home"),
      current: z.boolean().optional(),
      lat: latLon.lat.optional(),
      lon: latLon.lon.optional(),
      alt: z.number().optional(),
    })
    .refine((v) => v.current === true || (v.lat !== undefined && v.lon !== undefined && v.alt !== undefined), {
      message: "set_home needs current: true or lat, lon and alt",
    }),
  z.object({ type: z.literal("run_prearm") }),
  z.object({ type: z.literal("video_record"), on: z.boolean() }),
  z.object({ type: z.literal("param_fetch") }),
  z.object({ type: z.literal("gimbal_pitchyaw"), pitch: z.number().min(-90).max(30), yaw: z.number().min(-180).max(360), lock: z.boolean().optional() }),
  z.object({ type: z.literal("gimbal_mode"), mode: z.enum(["retract", "neutral", "mavlink", "rc", "gps"]) }),
  z.object({ type: z.literal("roi_location"), ...latLon, alt: z.number() }),
  z.object({ type: z.literal("roi_none") }),
  z.object({ type: z.literal("payload_relay"), index: payloadIndex, on: z.boolean(), comp: payloadComp }),
  z.object({ type: z.literal("payload_pulse"), index: payloadIndex, ms: z.number().int().min(50).max(10_000), comp: payloadComp }),
  z.object({ type: z.literal("payload_servo"), index: payloadIndex, pwm: z.number().int().min(800).max(2200), comp: payloadComp }),
  z.object({ type: z.literal("log_list") }),
  z.object({
    type: z.literal("log_download"),
    id: z.number().int().min(0).max(0xffff),
    size: z.number().int().positive(),
    utc: z.number().int().min(0).optional(),
  }),
  z.object({ type: z.literal("log_cancel") }),
  z.object({ type: z.literal("reboot") }),
  z.object({ type: z.literal("param_get"), names: z.array(paramName).min(1).max(50) }),
  z.object({
    type: z.literal("param_set"),
    params: z.record(paramName, z.number().finite()).refine((p) => {
      const n = Object.keys(p).length;
      return n >= 1 && n <= 50;
    }, "1 to 50 parameters"),
  }),
]);

export const ackPostSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  st: z.enum(["acked", "failed"]),
  code: z.string().min(1),
  msg: z.string().optional(),
  t: z.number(),
  res: z.record(z.string(), z.unknown()).optional(),
});

export const missionItemSchema = z.object({
  seq: z.number().int().min(0),
  cur: z.number().int(),
  frame: z.number().int(),
  cmd: z.number().int(),
  p1: z.number(),
  p2: z.number(),
  p3: z.number(),
  p4: z.number(),
  lat: z.number(),
  lon: z.number(),
  alt: z.number(),
  ac: z.number().int(),
});

export const missionKindSchema = z.enum(["mission", "fence", "rally"]);

export const missionCreateSchema = z.object({
  name: z.string().min(1),
  items: z.array(missionItemSchema).min(1).max(MAX_MISSION_ITEMS),
  source: z.enum(["editor", "import"]).optional(),
  kind: missionKindSchema.optional(),
});

export const missionPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    items: z.array(missionItemSchema).min(1).max(MAX_MISSION_ITEMS).optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

/** Device-side mission download: companion posts the items it read off the FC. */
export const missionDownloadSchema = z.object({
  commandId: z.string().min(1),
  items: z.array(missionItemSchema).min(1).max(MAX_MISSION_ITEMS),
  mtype,
});

/** Device-side: a full parameter table read by param_fetch. */
export const paramSnapshotSchema = z.object({
  commandId: z.string().min(1).nullable().optional(),
  params: z
    .record(z.string().regex(/^[A-Z0-9_]{1,16}$/), z.tuple([z.number(), z.number().int()]))
    .refine((p) => Object.keys(p).length <= 3000, "too many parameters"),
  fw: z.string().max(80).nullable().optional(),
});

export const historyQuerySchema = z.object({
  since: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export type CommandRequest = z.infer<typeof commandRequestSchema>;
