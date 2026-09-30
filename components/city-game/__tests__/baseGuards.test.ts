import { describe, it, expect, beforeEach } from 'vitest';
import { BaseGuards, GuardContext } from '../baseGuards';
import {
  BASE_CENTER,
  STEALABLE_TANK,
  TANK_POSTS,
  TRUCK_POSTS,
  isInsideBase,
} from '../militaryBase';
import { generateWorld, isSolidAtAltitude } from '../worldGen';
import { Vehicle, VehicleType, WorldData, TILE_SIZE } from '../types';

const world: WorldData = generateWorld(42);
const isSolidAt = (x: number, y: number) => isSolidAtAltitude(world.grid, x, y, 0);

/** Open apron in the middle of the base. */
const INSIDE = { x: 132 * TILE_SIZE + 20, y: 30 * TILE_SIZE + 20 };
/** Just outside the south gate, on the perimeter road. */
const OUTSIDE = { x: 128 * TILE_SIZE + 20, y: 41 * TILE_SIZE + 20 };

let vehicles: Map<string, Vehicle>;
let guards: BaseGuards;

function ctx(p: { x: number; y: number }, over: Partial<GuardContext> = {}): GuardContext {
  return {
    vehicles,
    player: { x: p.x, y: p.y, state: 'onFoot' },
    playerSpeed: 0,
    playerVehicleType: null,
    playerInBase: isInsideBase(p.x, p.y),
    dt: 1 / 60,
    isSolidAt,
    ...over,
  };
}

function run(c: GuardContext, seconds: number): 'busted' | null {
  let r: 'busted' | null = null;
  for (let i = 0; i < seconds * 60 && !r; i++) r = guards.update(c);
  return r;
}

beforeEach(() => {
  vehicles = new Map();
  guards = new BaseGuards();
});

describe('garrison', () => {
  it('stays empty while the player is far away', () => {
    guards.update(ctx({ x: 500, y: 5000 }));
    expect(guards.active).toBe(false);
    expect(vehicles.size).toBe(0);
  });

  it('mans every post and parks the stealable tank when the player approaches', () => {
    guards.update(ctx(OUTSIDE));
    expect(guards.active).toBe(true);
    expect(guards.guards).toHaveLength(TANK_POSTS.length + TRUCK_POSTS.length);
    const tanks = guards.guards.filter(g => g.kind === 'tank').map(g => vehicles.get(g.vehicleId)!);
    const trucks = guards.guards.filter(g => g.kind === 'truck').map(g => vehicles.get(g.vehicleId)!);
    for (const t of tanks) expect(t.type).toBe(VehicleType.TANK);
    for (const t of trucks) expect(t.type).toBe(VehicleType.ARMY_TRUCK);

    const loot = vehicles.get(guards.stealableId!)!;
    expect(loot.type).toBe(VehicleType.TANK);
    expect(loot.occupant).toBeNull();
    expect(loot.x).toBe(STEALABLE_TANK.x);
  });

  it('stays calm while the player is outside the wall', () => {
    run(ctx(OUTSIDE), 3);
    expect(guards.engaged()).toBe(false);
    for (const g of guards.guards) {
      const v = vehicles.get(g.vehicleId)!;
      expect(v.hostile).toBe(false);
      expect(Math.hypot(v.x - g.post.x, v.y - g.post.y)).toBeLessThan(10);
    }
  });

  it('goes home when the player leaves the area', () => {
    guards.update(ctx(OUTSIDE));
    const n = vehicles.size;
    expect(n).toBeGreaterThan(0);
    guards.update(ctx({ x: BASE_CENTER.x - 2500, y: BASE_CENTER.y + 2500 }));
    expect(guards.active).toBe(false);
    expect(vehicles.size).toBe(0);
  });
});

describe('intruders', () => {
  it('turns every guard hostile inside the wall', () => {
    guards.update(ctx(INSIDE));
    expect(guards.engaged()).toBe(true);
    for (const g of guards.guards) expect(vehicles.get(g.vehicleId)!.hostile).toBe(true);
  });

  it('trucks run down and arrest a player on foot', () => {
    expect(run(ctx(INSIDE), 20)).toBe('busted');
  });

  it('never chase past the wall', () => {
    guards.update(ctx(INSIDE));
    // Teleport the "player" right outside the south gate but still flagged inside.
    run(ctx(OUTSIDE, { playerInBase: true, playerSpeed: 200, player: { ...OUTSIDE, state: 'inCar' } }), 8);
    for (const g of guards.guards) {
      const v = vehicles.get(g.vehicleId)!;
      expect(isInsideBase(v.x, v.y)).toBe(true);
    }
  });

  it('return to their posts once the intruder is gone', () => {
    run(ctx(INSIDE, { playerSpeed: 200, player: { ...INSIDE, state: 'inCar' } }), 3);
    run(ctx(OUTSIDE), 25);
    expect(guards.engaged()).toBe(false);
    for (const g of guards.guards) {
      const v = vehicles.get(g.vehicleId)!;
      expect(Math.hypot(v.x - g.post.x, v.y - g.post.y)).toBeLessThan(20);
    }
  });

  it('tanks keep their distance rather than parking on the player', () => {
    run(ctx(INSIDE, { playerSpeed: 200, player: { ...INSIDE, state: 'inCar' } }), 10);
    for (const g of guards.guards.filter(x => x.kind === 'tank')) {
      const v = vehicles.get(g.vehicleId)!;
      expect(Math.hypot(v.x - INSIDE.x, v.y - INSIDE.y)).toBeGreaterThan(100);
    }
  });

  it('cannot arrest a player in a tank', () => {
    expect(run(ctx(INSIDE, { playerVehicleType: VehicleType.TANK, player: { ...INSIDE, state: 'inCar' } }), 15))
      .toBeNull();
  });
});

describe('the stealable tank', () => {
  it('is forgotten once boarded, and not duplicated while the player is nearby', () => {
    guards.update(ctx(OUTSIDE));
    const id = guards.stealableId!;
    expect(guards.onBoarded('someone-else')).toBe(false);
    expect(guards.onBoarded(id)).toBe(true);
    expect(guards.stealableId).toBeNull();
    guards.update(ctx(OUTSIDE));
    const tanks = [...vehicles.values()].filter(v => v.type === VehicleType.TANK && v.occupant === null);
    expect(tanks).toHaveLength(1);
  });

  it('is replaced after the player has been away', () => {
    guards.update(ctx(OUTSIDE));
    const first = guards.stealableId!;
    vehicles.get(first)!.occupant = 'player';
    guards.onBoarded(first);
    guards.update(ctx({ x: BASE_CENTER.x - 2500, y: BASE_CENTER.y + 2500 }));
    guards.update(ctx(OUTSIDE));
    expect(guards.stealableId).not.toBeNull();
    expect(guards.stealableId).not.toBe(first);
    // The stolen one is left alone.
    expect(vehicles.has(first)).toBe(true);
  });

  it('drops a guard the player has taken', () => {
    guards.update(ctx(OUTSIDE));
    const g = guards.guards.find(x => x.kind === 'truck')!;
    vehicles.get(g.vehicleId)!.occupant = 'player';
    guards.update(ctx(OUTSIDE));
    expect(guards.guards.some(x => x.vehicleId === g.vehicleId)).toBe(false);
    expect(vehicles.has(g.vehicleId)).toBe(true);
  });
});
