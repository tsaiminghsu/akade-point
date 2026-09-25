import { z } from "zod";

import { MAX_HISTORY_POINTS_PER_POST, MAX_MISSION_ITEMS } from "./constants";

/** A telemetry snapshot (companion → server). Mirrors VehicleState. */
export const vehicleStateSchema = z.object({
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

export const telemetryPostSchema = z.object({
  state: vehicleStateSchema,
  history: z.array(vehicleStateSchema).max(MAX_HISTORY_POINTS_PER_POST).optional(),
});

export const vehicleCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["drone", "rover"]),
  companionId: z.string().min(1),
  notes: z.string().optional(),
});

export const vehiclePatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.enum(["drone", "rover"]).optional(),
    companionId: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

/**
 * Command request from the browser. Discriminated on `type` so each command
 * validates only the args it needs. The route additionally checks the command
 * is allowed for the vehicle's type and that the mode is in range.
 */
export const commandRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("arm") }),
  z.object({ type: z.literal("disarm"), force: z.boolean().optional() }),
  z.object({ type: z.literal("set_mode"), mode: z.string().min(1) }),
  z.object({ type: z.literal("takeoff"), alt: z.number().positive() }),
  z.object({ type: z.literal("goto"), lat: z.number(), lon: z.number(), alt: z.number() }),
  z.object({ type: z.literal("rtl") }),
  z.object({ type: z.literal("mission_start") }),
  z.object({ type: z.literal("mission_upload"), missionId: z.string().min(1) }),
  z.object({ type: z.literal("mission_download") }),
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

export const missionCreateSchema = z.object({
  name: z.string().min(1),
  items: z.array(missionItemSchema).min(1).max(MAX_MISSION_ITEMS),
  source: z.enum(["editor", "import"]).optional(),
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
});

export const historyQuerySchema = z.object({
  since: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export type CommandRequest = z.infer<typeof commandRequestSchema>;
