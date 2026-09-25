import { NextResponse } from "next/server";

import { requireAdminOrDevBypass } from "@/lib/session";
import { chunk } from "@/lib/control-center/batch";
import { getMachine, type CCMachine } from "@/lib/dynamo/cc-machines";
import { applyClawConfigParts, type CCClawConfig } from "@/lib/dynamo/cc-claw-configs";
import { createEvents } from "@/lib/dynamo/cc-machine-events";
import { sanitizeDraft, type ClawConfigPart } from "@/lib/control-center/claw/config";
import { clawConfigCopySchema } from "@/lib/control-center/claw/schemas";

/** Machines read or written at once. */
const CONCURRENCY = 10;

const PART_LABEL: Record<ClawConfigPart, string> = { settings: "主機板設定", rig: "爪子／貨品／出貨口" };

/**
 * Apply one config to many machines. `parts` picks what is copied; the rest of
 * each target keeps its own value. Unknown machine ids are skipped and returned.
 */
export async function POST(req: Request) {
  const actor = await requireAdminOrDevBypass();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = clawConfigCopySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const draft = sanitizeDraft(body.data);
  const parts = Array.from(new Set(body.data.parts)) as ClawConfigPart[];
  const ids = Array.from(new Set(body.data.machineIds));
  const source = body.data.sourceMachineId ? await getMachine(body.data.sourceMachineId) : null;

  const machines: CCMachine[] = [];
  const missing: string[] = [];
  for (const batch of chunk(ids, CONCURRENCY)) {
    const found = await Promise.all(batch.map((id) => getMachine(id)));
    found.forEach((m, i) => (m ? machines.push(m) : missing.push(batch[i])));
  }

  const configs: CCClawConfig[] = [];
  for (const batch of chunk(machines, CONCURRENCY)) {
    configs.push(...(await Promise.all(batch.map((m) => applyClawConfigParts(m.id, draft, parts, actor.id ?? "admin")))));
  }

  const what = parts.map((p) => PART_LABEL[p]).join("、");
  const from = source ? `從「${source.name}」` : "";
  const events = await createEvents(
    configs.map((config, i) => ({
      machineId: config.machineId,
      storeId: machines[i].storeId,
      type: "config_change",
      message: `${machines[i].name} 已${from}套用娃娃機設定（${what}，第 ${config.revision} 版）`,
      severity: "info" as const,
      timestamp: config.updatedAt,
    }))
  ).catch((err) => {
    console.error("claw config copy event write failed", err);
    return [];
  });

  return NextResponse.json({ configs, missing, events });
}
