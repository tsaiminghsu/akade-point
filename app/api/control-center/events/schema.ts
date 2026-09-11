import { z } from "zod";

import { MAX_BATCH_ITEMS } from "@/lib/control-center/batch";

export const eventCreateSchema = z.object({
  machineId: z.string().min(1),
  storeId: z.string().min(1),
  type: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  timestamp: z.number().optional(),
});

export const eventBatchSchema = z.object({
  events: z.array(eventCreateSchema).min(1).max(MAX_BATCH_ITEMS),
});

/** Query params shared by the events and alerts list endpoints. `limit` is
 *  always applied: these endpoints never return a whole table. */
export const recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  before: z.coerce.number().int().positive().optional(),
  storeId: z.string().min(1).optional(),
  machineId: z.string().min(1).optional(),
});
