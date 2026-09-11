import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Economy, PRICES, START_CASH } from '../economy';
import {
  SAVE_KEY,
  SAVE_VERSION,
  clearSave,
  defaultSave,
  getRaceBest,
  loadSave,
  writeSave,
} from '../save';

/** Minimal in-memory localStorage so save.ts can be tested under node. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

function installStorage(): MemoryStorage {
  const store = new MemoryStorage();
  vi.stubGlobal('localStorage', store);
  return store;
}

describe('Economy', () => {
  let eco: Economy;

  beforeEach(() => {
    eco = new Economy();
  });

  it('starts with the default balance', () => {
    expect(eco.cash).toBe(START_CASH);
  });

  it('adds income and logs it', () => {
    eco.earn(150, 'mission');
    expect(eco.cash).toBe(START_CASH + 150);
    expect(eco.log.at(-1)).toMatchObject({ amount: 150, reason: 'mission' });
  });

  it('ignores non-positive income', () => {
    eco.earn(0, 'noop');
    eco.earn(-50, 'noop');
    expect(eco.cash).toBe(START_CASH);
    expect(eco.log).toHaveLength(0);
  });

  it('refuses a charge it cannot cover, leaving no trace', () => {
    expect(eco.charge(10_000, 'yacht')).toBe(false);
    expect(eco.cash).toBe(START_CASH);
    expect(eco.log).toHaveLength(0);
  });

  it('takes what it can when partial charges are allowed', () => {
    eco.charge(400, 'rent');
    expect(eco.cash).toBe(100);

    // A penalty larger than the balance zeroes it rather than going negative.
    expect(eco.charge('busted', 'busted', { allowPartial: true })).toBe(true);
    expect(eco.cash).toBe(0);
    expect(eco.log.at(-1)).toMatchObject({ amount: -100 });
  });

  it('never goes negative even on repeated penalties', () => {
    eco.reset(0);
    expect(eco.charge('hospital', 'hospital', { allowPartial: true })).toBe(true);
    expect(eco.cash).toBe(0);
  });

  it('resolves named prices', () => {
    eco.charge('phone_taxi');
    expect(eco.cash).toBe(START_CASH - PRICES.phone_taxi);
  });

  it('caps the transaction log at 20 entries, keeping the newest', () => {
    for (let i = 0; i < 30; i++) eco.earn(1, `tx${i}`);
    expect(eco.log).toHaveLength(20);
    expect(eco.log.at(-1)?.reason).toBe('tx29');
    expect(eco.log[0].reason).toBe('tx10');
  });

  it('expires HUD ticks after their lifetime', () => {
    const now = performance.now();
    eco.earn(10, 'a');
    expect(eco.drainTicks(now)).toHaveLength(1);
    // Well past the 2.5s TTL.
    expect(eco.drainTicks(now + 10_000)).toHaveLength(0);
  });

  it('round-trips through JSON', () => {
    eco.earn(275, 'mission');
    const restored = Economy.fromJSON(eco.toJSON());
    expect(restored.cash).toBe(eco.cash);
    expect(restored.log).toHaveLength(eco.log.length);
  });

  it('falls back to the default balance on malformed input', () => {
    expect(Economy.fromJSON(undefined).cash).toBe(START_CASH);
    expect(Economy.fromJSON({ cash: NaN }).cash).toBe(START_CASH);
    expect(Economy.fromJSON({ cash: -10 }).cash).toBe(0);
  });
});

describe('save file', () => {
  let store: MemoryStorage;

  beforeEach(() => {
    store = installStorage();
  });

  it('returns defaults when nothing is stored', () => {
    const save = loadSave();
    expect(save.cash).toBe(START_CASH);
    expect(save.stats.missionsCompleted).toBe(0);
  });

  it('round-trips a written save', () => {
    const save = defaultSave();
    save.cash = 1234;
    save.stats.taxiFares = 7;
    save.missionBest.courier_civic = 42;
    writeSave(save);

    const loaded = loadSave();
    expect(loaded.cash).toBe(1234);
    expect(loaded.stats.taxiFares).toBe(7);
    expect(loaded.missionBest.courier_civic).toBe(42);
  });

  it('falls back to defaults on corrupt JSON', () => {
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave().cash).toBe(START_CASH);
  });

  it('falls back to defaults on a version mismatch', () => {
    store.setItem(SAVE_KEY, JSON.stringify({ ...defaultSave(), v: SAVE_VERSION + 99, cash: 9999 }));
    expect(loadSave().cash).toBe(START_CASH);
  });

  it('fills in fields missing from an older partial save', () => {
    store.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, cash: 300 }));
    const loaded = loadSave();
    expect(loaded.cash).toBe(300);
    expect(loaded.stats.discovered).toEqual([]);
    expect(loaded.raceBest).toEqual({});
  });

  it('migrates legacy race_best_* keys and deletes them', () => {
    store.setItem('race_best_east_loop', '48.5');
    store.setItem('race_best_civic_slalom', '61.25');

    const loaded = loadSave();
    expect(loaded.raceBest.east_loop).toBeCloseTo(48.5);
    expect(loaded.raceBest.civic_slalom).toBeCloseTo(61.25);
    expect(store.getItem('race_best_east_loop')).toBeNull();
    expect(store.getItem('race_best_civic_slalom')).toBeNull();

    // The migration is persisted, so a reload keeps the times.
    expect(loadSave().raceBest.east_loop).toBeCloseTo(48.5);
  });

  it('keeps the faster time when a legacy key duplicates a saved one', () => {
    const save = defaultSave();
    save.raceBest.east_loop = 40;
    writeSave(save);
    store.setItem('race_best_east_loop', '55');
    expect(loadSave().raceBest.east_loop).toBe(40);
  });

  it('exposes best laps through getRaceBest', () => {
    const save = defaultSave();
    save.raceBest.east_loop = 33.5;
    writeSave(save);
    expect(getRaceBest('east_loop')).toBeCloseTo(33.5);
    expect(getRaceBest('missing_course')).toBeNull();
  });

  it('clears both the save and any legacy keys', () => {
    writeSave(defaultSave());
    store.setItem('race_best_east_loop', '48.5');
    clearSave();
    expect(store.getItem(SAVE_KEY)).toBeNull();
    expect(store.getItem('race_best_east_loop')).toBeNull();
  });

  it('degrades quietly when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => writeSave(defaultSave())).not.toThrow();
    expect(() => clearSave()).not.toThrow();
    expect(loadSave().cash).toBe(START_CASH);
  });
});
