import { z } from "zod";

import { MAX_BATCH_ITEMS } from "@/lib/control-center/batch";

export const alertCreateSchema = z.object({
  machineId: z.string().min(1),
  storeId: z.string().min(1),
  type: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
});

export const alertBatchSchema = z.object({
  alerts: z.array(alertCreateSchema).min(1).max(MAX_BATCH_ITEMS),
});
