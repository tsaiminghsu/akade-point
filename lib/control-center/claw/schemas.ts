import { z } from "zod";

import { CLAW_CONFIG_PARTS } from "./config";

/**
 * Request shapes only. The values are clamped and defaulted afterwards by
 * sanitizeDraft(), which knows every setting's range; zod just rejects bodies
 * that aren't the right kind of thing at all.
 */
export const clawDraftSchema = z.object({
  settings: z.record(z.string(), z.number().finite()),
  rig: z.object({
    claw: z.string(),
    fit: z.record(z.string(), z.unknown()),
    stock: z.record(z.string(), z.unknown()),
    chute: z.record(z.string(), z.number().finite()),
  }),
});

export const clawConfigPutSchema = clawDraftSchema.extend({
  /** Revision the editor loaded; 0 when the machine had no saved config. */
  revision: z.number().int().min(0),
});

/** Most machines a single copy may target. */
export const MAX_COPY_TARGETS = 200;

export const clawConfigCopySchema = clawDraftSchema.extend({
  parts: z.array(z.enum(CLAW_CONFIG_PARTS as [string, ...string[]])).min(1),
  machineIds: z.array(z.string().min(1)).min(1).max(MAX_COPY_TARGETS),
  /** Machine the config came from, named in the targets' event log. */
  sourceMachineId: z.string().min(1).optional(),
});
