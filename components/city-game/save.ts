import { EconomyJSON, START_CASH } from './economy';

/**
 * Persistent save file.
 *
 * Everything the player accumulates across sessions lives in one localStorage
 * key. Race best laps used to live in their own `race_best_<id>` keys; those are
 * migrated in on first load and then deleted.
 */

export const SAVE_KEY = 'city_save';
export const SAVE_VERSION = 1;
const LEGACY_RACE_PREFIX = 'race_best_';

export interface SaveStats {
  missionsCompleted: number;
  taxiFares: number;
  deliveries: number;
  couriers: number;
  timesBusted: number;
  /** Landmark / zone ids the player has discovered. */
  discovered: string[];
}

export interface CitySave {
  v: number;
  cash: number;
  economyLog: EconomyJSON['log'];
  stats: SaveStats;
  /** defId -> best result (seconds for timed jobs, dollars for earnings jobs). */
  missionBest: Record<string, number>;
  /** courseId -> best lap in seconds. */
  raceBest: Record<string, number>;
  savedAt: number;
}

export function defaultSave(): CitySave {
  return {
    v: SAVE_VERSION,
    cash: START_CASH,
    economyLog: [],
    stats: {
      missionsCompleted: 0,
      taxiFares: 0,
      deliveries: 0,
      couriers: 0,
      timesBusted: 0,
      discovered: [],
    },
    missionBest: {},
    raceBest: {},
    savedAt: 0,
  };
}

export function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Private mode / blocked storage.
    return null;
  }
}

/** Pull any legacy per-course keys into the save, then remove them. */
function migrateRaceBest(save: CitySave, store: Storage): boolean {
  const legacy: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && key.startsWith(LEGACY_RACE_PREFIX)) legacy.push(key);
  }
  if (legacy.length === 0) return false;

  for (const key of legacy) {
    const courseId = key.slice(LEGACY_RACE_PREFIX.length);
    const value = parseFloat(store.getItem(key) ?? '');
    if (Number.isFinite(value) && value > 0) {
      const existing = save.raceBest[courseId];
      if (!existing || value < existing) save.raceBest[courseId] = value;
    }
    store.removeItem(key);
  }
  return true;
}

export function loadSave(): CitySave {
  const store = storage();
  if (!store) return defaultSave();

  let save = defaultSave();
  try {
    const raw = store.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CitySave>;
      if (parsed && parsed.v === SAVE_VERSION) {
        const base = defaultSave();
        save = {
          ...base,
          ...parsed,
          stats: { ...base.stats, ...(parsed.stats ?? {}) },
          missionBest: { ...(parsed.missionBest ?? {}) },
          raceBest: { ...(parsed.raceBest ?? {}) },
        };
      }
      // A different version falls back to a fresh save rather than guessing.
    }
  } catch {
    save = defaultSave();
  }

  if (migrateRaceBest(save, store)) writeSave(save);
  return save;
}

export function writeSave(save: CitySave): void {
  const store = storage();
  if (!store) return;
  try {
    save.savedAt = Date.now();
    store.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Quota or blocked storage: losing the save is preferable to crashing.
  }
}

export function clearSave(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
    const legacy: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(LEGACY_RACE_PREFIX)) legacy.push(key);
    }
    for (const key of legacy) store.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

/** Best lap for a course, or null. Reads through the unified save. */
export function getRaceBest(courseId: string): number | null {
  const best = loadSave().raceBest[courseId];
  return typeof best === 'number' && best > 0 ? best : null;
}
