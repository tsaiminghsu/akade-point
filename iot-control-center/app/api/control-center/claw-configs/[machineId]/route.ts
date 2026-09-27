import { NextResponse } from "next/server";

import { requireAdminOrDevBypass } from "@/lib/session";
import { getMachine } from "@/lib/dynamo/cc-machines";
import { deleteClawConfig, getClawConfig, saveClawConfig } from "@/lib/dynamo/cc-claw-configs";
import { createEvent } from "@/lib/dynamo/cc-machine-events";
import { describeChange, diffDrafts, factoryConfig, hasChanges, sanitizeDraft } from "@/lib/control-center/claw/config";
import { clawConfigPutSchema } from "@/lib/control-center/claw/schemas";
import { settingsSha } from "@/lib/control-center/claw/device";
import { notifyClawConfig } from "@/lib/iot/claw-notify";

type Ctx = { params: { machineId: string } };

/** The machine's saved config, or the factory one (revision 0) if it has none. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [machine, config] = await Promise.all([getMachine(params.machineId), getClawConfig(params.machineId)]);
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });
  return NextResponse.json({ config: config ?? factoryConfig(params.machineId) });
}

/**
 * Save the editor's config. `revision` is the one it loaded; if someone saved
 * in between, nothing is written and the 409 carries their config.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const actor = await requireAdminOrDevBypass();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = clawConfigPutSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const machineId = params.machineId;
  const [machine, saved] = await Promise.all([getMachine(machineId), getClawConfig(machineId)]);
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });
  const prev = saved ?? factoryConfig(machineId);
  if (prev.revision !== body.data.revision) {
    return NextResponse.json({ error: "Config was changed by someone else", config: prev }, { status: 409 });
  }

  const draft = sanitizeDraft(body.data);
  const change = diffDrafts(prev, draft);
  // Saving what is already saved writes nothing and logs nothing.
  if (saved && !hasChanges(change)) return NextResponse.json({ config: prev });

  const config = await saveClawConfig(machineId, draft, body.data.revision, actor.id ?? "admin");
  if (!config) {
    const latest = (await getClawConfig(machineId)) ?? factoryConfig(machineId);
    return NextResponse.json({ error: "Config was changed by someone else", config: latest }, { status: 409 });
  }

  const event = await createEvent({
    machineId,
    storeId: machine.storeId,
    type: "config_change",
    message: `${machine.name} 娃娃機設定已更新（第 ${config.revision} 版）：${describeChange(change)}`,
    severity: "info",
    timestamp: config.updatedAt,
  }).catch((err) => {
    // The config is saved; a missing log line shouldn't turn that into an error.
    console.error("claw config event write failed", err);
    return null;
  });
  // Ring the board only when its settings changed; a rig-only save is nothing to apply.
  const sha = settingsSha(config.settings);
  const notify =
    sha === settingsSha(prev.settings)
      ? null
      : await notifyClawConfig([{ machineId, sha, rev: config.revision }]);
  return NextResponse.json({ config, event, notify });
}

/** Back to factory defaults: the row is removed. */
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const machineId = params.machineId;
  const [machine, saved] = await Promise.all([getMachine(machineId), getClawConfig(machineId)]);
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });
  if (!saved) return NextResponse.json({ config: factoryConfig(machineId), event: null });

  await deleteClawConfig(machineId);
  const factory = factoryConfig(machineId);
  const factorySha = settingsSha(factory.settings);
  const notify =
    factorySha === settingsSha(saved.settings)
      ? null
      : await notifyClawConfig([{ machineId, sha: factorySha, rev: 0 }]);
  const event = await createEvent({
    machineId,
    storeId: machine.storeId,
    type: "config_reset",
    message: `${machine.name} 娃娃機設定已恢復出廠值`,
    severity: "info",
    timestamp: Date.now(),
  }).catch((err) => {
    console.error("claw config event write failed", err);
    return null;
  });
  return NextResponse.json({ config: factory, event, notify });
}
