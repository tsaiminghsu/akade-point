import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine3D } from '../engine3d';
import { START_CASH } from '../economy';
import { VehicleType } from '../types';

/** Minimal in-memory localStorage so the engine's save layer works in node. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

let engine: GameEngine3D;

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  engine = new GameEngine3D();
});

describe('engine restart', () => {
  it('restores the starting balance and player position', () => {
    const startX = engine.player.x;
    const startY = engine.player.y;

    engine.economy.earn(5000, 'test');
    engine.player.x = 100;
    engine.player.y = 100;
    engine.player.health = 12;
    engine.wanted.set(4);

    engine.reset({ clearSave: true });

    expect(engine.economy.cash).toBe(START_CASH);
    expect(engine.player.x).toBe(startX);
    expect(engine.player.y).toBe(startY);
    expect(engine.player.health).toBe(100);
    expect(engine.wanted.stars).toBe(0);
    expect(engine.player.state).toBe('inCar');
  });

  it('keeps the same world object, so the city mesh is never rebuilt', () => {
    const world = engine.world;
    const grid = engine.world.grid;
    engine.reset({ clearSave: true });
    expect(engine.world).toBe(world);
    expect(engine.world.grid).toBe(grid);
  });

  it('rebuilds the vehicle fleet back to its initial size', () => {
    const before = engine.vehicles.size;
    expect(before).toBeGreaterThan(1);

    // Litter the world, then restart.
    for (let i = 0; i < 10; i++) {
      engine.vehicles.set(`junk${i}`, {
        ...engine.vehicles.get(engine.player.currentVehicleId!)!,
        id: `junk${i}`,
        occupant: null,
      });
    }
    expect(engine.vehicles.size).toBeGreaterThan(before);

    engine.reset({ clearSave: true });
    expect(engine.vehicles.size).toBe(before);
  });

  it('clears race, mission, police and wreck state', () => {
    engine.startRace('east_loop');
    expect(engine.raceSession).not.toBeNull();

    engine.reset({ clearSave: true });
    expect(engine.raceSession).toBeNull();
    expect(engine.missions.session).toBeNull();
    expect(engine.police.units).toHaveLength(0);
    expect(engine.waypoint.active).toBe(false);
    expect(engine.route.points).toBeNull();
  });

  it('repopulates the crowd', () => {
    engine.reset({ clearSave: true });
    expect(engine.pedestrians.count).toBeGreaterThan(0);
  });

  it('keeps the save when clearSave is false', () => {
    engine.economy.earn(750, 'test');
    engine.flushSave();
    const cash = engine.economy.cash;

    engine.reset({ clearSave: false });
    expect(engine.economy.cash).toBe(cash);
  });

  it('starts a fresh engine from the persisted save', () => {
    engine.economy.earn(320, 'test');
    engine.save.stats.missionsCompleted = 4;
    engine.flushSave();

    const revived = new GameEngine3D();
    expect(revived.economy.cash).toBe(START_CASH + 320);
    expect(revived.save.stats.missionsCompleted).toBe(4);
  });
});

describe('phone services charge the player', () => {
  it('refuses to dispatch when the balance is too low', () => {
    engine.economy.reset(0);
    engine.dispatchTaxi();
    expect(engine.orders).toHaveLength(0);
    expect(engine.notifications.at(-1)?.text).toContain('現金不足');
  });

  it('deducts the fare when it can be paid', () => {
    const before = engine.economy.cash;
    engine.dispatchTaxi();
    expect(engine.economy.cash).toBeLessThan(before);
    expect(engine.orders).toHaveLength(1);
  });
});

describe('carjack gating', () => {
  it('reports an occupied NPC car as a theft target', () => {
    engine.player.state = 'onFoot';
    engine.player.currentVehicleId = null;

    // Park an NPC-occupied car right next to the player.
    const target = [...engine.vehicles.values()].find(
      v => v.occupant === 'npc' && v.type === VehicleType.NPC_CAR,
    )!;
    target.x = engine.player.x + 10;
    target.y = engine.player.y;

    expect(engine.nearestVehicleInfo()).toBe('occupied');
  });

  it('reports an empty car as free to take', () => {
    engine.player.state = 'onFoot';
    engine.player.currentVehicleId = null;

    const target = [...engine.vehicles.values()].find(v => v.occupant === 'npc')!;
    target.occupant = null;
    target.x = engine.player.x + 10;
    target.y = engine.player.y;

    expect(engine.nearestVehicleInfo()).toBe('free');
  });

  it('ignores wrecks', () => {
    engine.player.state = 'onFoot';
    engine.player.currentVehicleId = null;

    const target = [...engine.vehicles.values()].find(v => v.occupant === 'npc')!;
    target.hp = 0;
    target.x = engine.player.x + 10;
    target.y = engine.player.y;

    expect(engine.nearestVehicleInfo()).toBe('none');
  });
});
