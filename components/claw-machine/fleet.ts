// The operator's machines. Each cabinet keeps its own mainboard settings, its
// hardware (claw, stock, chute) and its books (coin/play/win counts and the
// 保夾 counter), like separate machines on an arcade floor. Pure data +
// helpers so the fleet logic is tested without a browser; the component only
// loads, saves and renders it.

import {
  BED_LIFT, DEFAULT_ANTI_SWING, DEFAULT_CHUTE, DEFAULT_GANTRY, isFieldType, sanitizeAntiSwing, sanitizeBedLift, sanitizeChute,
  sanitizeGantry, type AntiSwing, type ChuteConfig, type FieldType, type GantryConfig, type Stats,
} from './clawSim';
import { isClawType, sanitizeFit, type ClawFit, type ClawType } from './claws';
import { sanitizeStock, type Stock } from './items';
import { sanitizeShaker, type ShakerConfig } from './shaker';
import { sanitizeTower, type TowerConfig } from './tower';
import { defaultSettings, sanitizeSettings, type ClawSettings } from './settings';

/**
 * Operator hardware fitted to one cabinet. `bedLift` is a 3D 彈跳台's corner
 * lift (m); `tower` the 大怒神 setup (座數, 單格/雙格, each cell's dice and
 * rule, 彈性); `shaker` the 搖骰子盒 setup (grid, rule, 鬆緊); `gantry` the
 * 限位器 and 起始點.
 */
export interface Rig {
  claw: ClawType; fit: ClawFit; stock: Stock; chute: ChuteConfig; field: FieldType; bedLift: number;
  tower: TowerConfig; shaker: ShakerConfig; antiSwing: AntiSwing; gantry: GantryConfig;
}

/** A cabinet's running totals, kept across visits (the board's 帳目 and 累保). */
export interface Books { stats: Stats; sinceGuarantee: number }

export interface MachineConfig {
  id: string;
  name: string;
  settings: ClawSettings;
  rig: Rig;
  books: Books;
}

export interface Fleet {
  machines: MachineConfig[];
  activeId: string;
}

export const FLEET_KEY = 'claw-machine-fleet-v1';
/** Where a single machine's settings and rig were saved before there were several. */
export const LEGACY_KEYS = { settings: 'claw-machine-settings-v1', rig: 'claw-machine-rig-v1' } as const;
export const NAME_MAX = 12;
export const MAX_MACHINES = 20;

export function defaultRig(): Rig {
  return {
    claw: 'standard', fit: sanitizeFit(null), stock: sanitizeStock(null),
    chute: { ...DEFAULT_CHUTE }, field: 'flat', bedLift: BED_LIFT.default, tower: sanitizeTower(null), shaker: sanitizeShaker(null),
    antiSwing: { ...DEFAULT_ANTI_SWING }, gantry: { ...DEFAULT_GANTRY },
  };
}

export function emptyBooks(): Books {
  return { stats: { coins: 0, plays: 0, wins: 0, guarantees: 0 }, sinceGuarantee: 0 };
}

export function sanitizeRig(raw: unknown): Rig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rest = {
    stock: sanitizeStock(obj.stock), chute: sanitizeChute(obj.chute),
    field: isFieldType(obj.field) ? obj.field : 'flat' as FieldType, bedLift: sanitizeBedLift(obj.bedLift),
    tower: sanitizeTower(obj.tower), shaker: sanitizeShaker(obj.shaker), antiSwing: sanitizeAntiSwing(obj.antiSwing), gantry: sanitizeGantry(obj.gantry),
  };
  // Older saves had a separate 巨無霸 claw type; it is now the 6號 size.
  if (obj.claw === 'jumbo') return { claw: 'standard', fit: sanitizeFit({ size: '6', bend: 'straight' }), ...rest };
  return { claw: isClawType(obj.claw) ? obj.claw : 'standard', fit: sanitizeFit(obj.fit), ...rest };
}

function sanitizeBooks(raw: unknown): Books {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const st = (obj.stats && typeof obj.stats === 'object' ? obj.stats : {}) as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    stats: { coins: count(st.coins), plays: count(st.plays), wins: count(st.wins), guarantees: count(st.guarantees) },
    sinceGuarantee: count(obj.sinceGuarantee),
  };
}

export function cleanName(name: unknown): string {
  return typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '';
}

/** The first free "N號機" name. */
export function nextMachineName(machines: Pick<MachineConfig, 'name'>[]): string {
  const taken = new Set(machines.map((m) => m.name));
  for (let n = 1; ; n++) if (!taken.has(`${n}號機`)) return `${n}號機`;
}

function nextId(machines: Pick<MachineConfig, 'id'>[]): string {
  const used = new Set(machines.map((m) => m.id));
  for (let n = machines.length + 1; ; n++) if (!used.has(`m${n}`)) return `m${n}`;
}

export function newMachine(machines: MachineConfig[], from?: MachineConfig): MachineConfig {
  return {
    id: nextId(machines),
    name: nextMachineName(machines),
    settings: from ? { ...from.settings } : defaultSettings(),
    rig: from ? structuredClone(from.rig) : defaultRig(),
    books: emptyBooks(),
  };
}

/**
 * Accept anything (parsed localStorage) and return a usable fleet: at least
 * one machine, unique ids, an active machine that exists. With nothing saved
 * yet, the single machine saved before fleets existed becomes 1號機.
 */
export function sanitizeFleet(raw: unknown, legacy?: { settings?: unknown; rig?: unknown }): Fleet {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const machines: MachineConfig[] = [];
  const list = Array.isArray(obj.machines) ? obj.machines.slice(0, MAX_MACHINES) : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const id = typeof m.id === 'string' && m.id && !machines.some((x) => x.id === m.id) ? m.id : nextId(machines);
    machines.push({
      id,
      name: cleanName(m.name) || nextMachineName(machines),
      settings: sanitizeSettings(m.settings),
      rig: sanitizeRig(m.rig),
      books: sanitizeBooks(m.books),
    });
  }
  if (machines.length === 0) {
    machines.push({
      id: 'm1',
      name: '1號機',
      settings: sanitizeSettings(legacy?.settings ?? null),
      rig: sanitizeRig(legacy?.rig ?? null),
      books: emptyBooks(),
    });
  }
  const activeId = machines.some((m) => m.id === obj.activeId) ? (obj.activeId as string) : machines[0].id;
  return { machines, activeId };
}

export function activeMachine(fleet: Fleet): MachineConfig {
  return fleet.machines.find((m) => m.id === fleet.activeId) ?? fleet.machines[0];
}

export function selectMachine(fleet: Fleet, id: string): Fleet {
  return fleet.machines.some((m) => m.id === id) ? { ...fleet, activeId: id } : fleet;
}

/** Add a machine (factory defaults, or a copy of `fromId`'s settings and rig) and switch to it. */
export function addMachine(fleet: Fleet, fromId?: string): Fleet {
  if (fleet.machines.length >= MAX_MACHINES) return fleet;
  const from = fromId ? fleet.machines.find((m) => m.id === fromId) : undefined;
  const m = newMachine(fleet.machines, from);
  return { machines: [...fleet.machines, m], activeId: m.id };
}

export function renameMachine(fleet: Fleet, id: string, name: string): Fleet {
  const clean = cleanName(name);
  if (!clean) return fleet;
  return { ...fleet, machines: fleet.machines.map((m) => (m.id === id ? { ...m, name: clean } : m)) };
}

/** Remove a machine; the last one can't go. Removing the active one switches to its neighbour. */
export function removeMachine(fleet: Fleet, id: string): Fleet {
  if (fleet.machines.length <= 1) return fleet;
  const i = fleet.machines.findIndex((m) => m.id === id);
  if (i < 0) return fleet;
  const machines = fleet.machines.filter((m) => m.id !== id);
  const activeId = fleet.activeId === id ? machines[Math.min(i, machines.length - 1)].id : fleet.activeId;
  return { machines, activeId };
}

export function updateMachine(fleet: Fleet, id: string, patch: Partial<Omit<MachineConfig, 'id'>>): Fleet {
  return { ...fleet, machines: fleet.machines.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}
