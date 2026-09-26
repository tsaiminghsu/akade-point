// Server-side storage for the claw machines' settings (/games/claw-machine).
//
// Each shop (店家, keyed like lib/dynamo/shops.ts's shopCode) has a fleet of
// machines. A machine is stored as its own record, id + name + position +
// config, where the config is the game's own JSON for it: mainboard
// settings, rig (claw, stock, chute, 檯面, 大怒神, 搖骰子盒, 限位器…) and
// books. The game sanitizes whatever it loads, so the server only checks the
// shape and size.
//
// For now it's kept in SQLite (sqliteFleetRepository.ts, a file under
// data/). The production database is still to be planned: implement
// FleetRepository for it (say a DynamoDB table keyed shopCode + machine id,
// one item per machine, the same fields) and return it from
// getFleetRepository() in fleetStore.ts; nothing else has to change.

/** One machine as stored. */
export interface StoredMachine {
  id: string;
  name: string;
  /** The game's config for it: `settings`, `rig` and `books`. */
  config: Record<string, unknown>;
}

/** A shop's machines, in order, which one is on screen, and when the game last changed them (ms since epoch). */
export interface StoredFleet {
  activeId: string;
  machines: StoredMachine[];
  savedAt: number;
}

export interface FleetRepository {
  load(shop: string): Promise<StoredFleet | null>;
  save(shop: string, fleet: StoredFleet): Promise<void>;
  remove(shop: string): Promise<void>;
}

/** The store can't be used here (e.g. this Node has no SQLite). */
export class StoreUnavailableError extends Error {}

export const FLEET_LIMITS = {
  /** Same cap as the game's (MAX_MACHINES in components/claw-machine/fleet.ts). */
  machines: 20,
  /** Longest id and name taken. */
  text: 40,
  /** Largest request body (bytes). */
  body: 512 * 1024,
} as const;

/** Shop codes: letters, digits, _ and -, up to 40. */
export function isShopCode(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A fleet as the game sends it (`{ fleet: { machines, activeId }, savedAt }`),
 * checked and turned into records; null if it isn't one.
 */
export function parseFleetBody(raw: unknown): StoredFleet | null {
  if (!isRecord(raw) || !isRecord(raw.fleet)) return null;
  const list = raw.fleet.machines;
  if (!Array.isArray(list) || list.length === 0 || list.length > FLEET_LIMITS.machines) return null;
  const machines: StoredMachine[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    if (!isRecord(m)) return null;
    const { id, name, settings, rig, books } = m;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > FLEET_LIMITS.text || seen.has(id)) return null;
    if (typeof name !== 'string' || name.length > FLEET_LIMITS.text) return null;
    if (!isRecord(settings) || !isRecord(rig) || !isRecord(books)) return null;
    seen.add(id);
    machines.push({ id, name, config: { settings, rig, books } });
  }
  const activeId = typeof raw.fleet.activeId === 'string' && seen.has(raw.fleet.activeId) ? raw.fleet.activeId : machines[0].id;
  const savedAt = typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) && raw.savedAt > 0 ? raw.savedAt : Date.now();
  return { activeId, machines, savedAt };
}

/** Back to the game's shape: `{ machines: [{ id, name, settings, rig, books }], activeId }`. */
export function toGameFleet(fleet: StoredFleet) {
  return {
    activeId: fleet.activeId,
    machines: fleet.machines.map((m) => ({ ...m.config, id: m.id, name: m.name })),
  };
}
