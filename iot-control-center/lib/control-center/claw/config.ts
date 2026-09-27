// Per-machine claw-machine configuration: the 飛絡力 board settings plus the
// operator's hardware choices (claw head, stock, chute). The simulator in
// components/control-center/claw-machine/game owns the meaning of every field;
// this module only normalises, compares and describes whole configs. It must
// not import the simulator's physics (clawSim.ts / physics.ts pull in Rapier),
// because the API routes use it too.

import {
  SETTING_DEFS,
  formatSetting,
  sanitizeSettings,
  type ClawSettings,
  type SettingKey,
} from "@/components/control-center/claw-machine/game/settings";
import {
  CLAW_BEND_LABEL,
  CLAW_TYPES,
  sanitizeFit,
  sizeLabel,
  styleOf,
  type ClawFit,
  type ClawType,
} from "@/components/control-center/claw-machine/game/claws";
import { sanitizeStock, type Stock } from "@/components/control-center/claw-machine/game/items";
import { sanitizeChute, type ChuteConfig } from "@/components/control-center/claw-machine/game/chute";

/** The machine's fitted hardware and load, as set on the service panel's other tabs. */
export interface ClawRig {
  claw: ClawType;
  fit: ClawFit;
  stock: Stock;
  chute: ChuteConfig;
}

/** What the operator edits: board settings and rig. */
export interface ClawDraft {
  settings: ClawSettings;
  rig: ClawRig;
}

export interface ClawConfig extends ClawDraft {
  machineId: string;
  /** Bumped on every save. 0 means never saved, i.e. factory defaults. */
  revision: number;
  updatedAt: number;
  updatedBy: string | null;
}

export type ClawConfigPart = "settings" | "rig";
export const CLAW_CONFIG_PARTS: readonly ClawConfigPart[] = ["settings", "rig"];

export type RigPart = "claw" | "stock" | "chute";

export function sanitizeRig(raw: unknown): ClawRig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rest = { stock: sanitizeStock(obj.stock), chute: sanitizeChute(obj.chute) };
  // The game's older saves had a separate 巨無霸 claw type; it is now the 6號 size.
  if (obj.claw === "jumbo") return { claw: "standard", fit: sanitizeFit({ size: "6", bend: "straight" }), ...rest };
  // Not the game's isClawType(): it tests `v in STYLES`, which also accepts
  // inherited names like "constructor", and this input comes from the API.
  const claw = CLAW_TYPES.find((t) => t === obj.claw) ?? "standard";
  return { claw, fit: sanitizeFit(obj.fit), ...rest };
}

export function defaultDraft(): ClawDraft {
  return { settings: sanitizeSettings(null), rig: sanitizeRig(null) };
}

export function sanitizeDraft(raw: unknown): ClawDraft {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { settings: sanitizeSettings(obj.settings), rig: sanitizeRig(obj.rig) };
}

/** The factory config a machine has until someone saves one for it. */
export function factoryConfig(machineId: string): ClawConfig {
  return { machineId, ...defaultDraft(), revision: 0, updatedAt: 0, updatedBy: null };
}

/** Normalise a stored row, so rows written by an older build still load. */
export function toClawConfig(row: Record<string, unknown>): ClawConfig {
  return {
    machineId: String(row.machineId),
    ...sanitizeDraft(row),
    revision: typeof row.revision === "number" ? row.revision : 0,
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : 0,
    updatedBy: typeof row.updatedBy === "string" ? row.updatedBy : null,
  };
}

// Sanitizers build objects in a fixed key order (settings follow SETTING_DEFS,
// stock categories follow ITEM_CATEGORIES), so equal configs stringify equally.
const key = (value: unknown) => JSON.stringify(value);

export function sameDraft(a: ClawDraft, b: ClawDraft): boolean {
  return key(sanitizeDraft(a)) === key(sanitizeDraft(b));
}

export interface SettingChange {
  key: SettingKey;
  code: string;
  label: string;
  from: number;
  to: number;
}

export interface DraftChange {
  settings: SettingChange[];
  rig: RigPart[];
}

export function diffDrafts(prev: ClawDraft, next: ClawDraft): DraftChange {
  const a = sanitizeDraft(prev);
  const b = sanitizeDraft(next);
  const settings: SettingChange[] = [];
  for (const def of SETTING_DEFS) {
    if (a.settings[def.key] !== b.settings[def.key]) {
      settings.push({ key: def.key, code: def.code, label: def.label, from: a.settings[def.key], to: b.settings[def.key] });
    }
  }
  const rig: RigPart[] = [];
  if (a.rig.claw !== b.rig.claw || key(a.rig.fit) !== key(b.rig.fit)) rig.push("claw");
  if (key(a.rig.stock) !== key(b.rig.stock)) rig.push("stock");
  if (key(a.rig.chute) !== key(b.rig.chute)) rig.push("chute");
  return { settings, rig };
}

export function hasChanges(change: DraftChange): boolean {
  return change.settings.length > 0 || change.rig.length > 0;
}

const RIG_LABEL: Record<RigPart, string> = { claw: "爪子", stock: "貨品", chute: "出貨口" };
/** Setting changes listed by name in an event message before it says "…等 N 項". */
const MAX_LISTED = 6;

/**
 * One-line summary for the machine's event log, in the board's own terms
 * (event messages are stored text, and the rest of the log is Chinese).
 */
export function describeChange(change: DraftChange): string {
  const parts: string[] = [];
  const listed = change.settings.slice(0, MAX_LISTED).map((c) => {
    const def = SETTING_DEFS.find((d) => d.key === c.key)!;
    return `${c.code} ${c.label} ${formatSetting(def, c.from)}→${formatSetting(def, c.to)}`;
  });
  if (listed.length) {
    const more = change.settings.length - listed.length;
    parts.push(listed.join("、") + (more > 0 ? ` 等 ${change.settings.length} 項` : ""));
  }
  if (change.rig.length) parts.push(change.rig.map((p) => RIG_LABEL[p]).join("、"));
  return parts.join("；") || "無變更";
}

/** Short description of the fitted claw, e.g. "標準三爪 4號 彎爪 100%". */
export function describeClaw(rig: Pick<ClawRig, "claw" | "fit">): string {
  return `${styleOf(rig.claw).label} ${sizeLabel(rig.fit.size)} ${CLAW_BEND_LABEL[rig.fit.bend]} ${rig.fit.openPct}%`;
}

/** Copy the chosen parts of `source` over `target`. */
export function mergeParts(target: ClawDraft, source: ClawDraft, parts: readonly ClawConfigPart[]): ClawDraft {
  return {
    settings: parts.includes("settings") ? source.settings : target.settings,
    rig: parts.includes("rig") ? source.rig : target.rig,
  };
}
