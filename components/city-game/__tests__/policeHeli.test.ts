import { describe, it, expect, beforeEach } from 'vitest';
import { HELI_ALT, HELI_SIGHT, HELI_SPEED, HeliContext, HeliSystem, SPOT_RADIUS } from '../policeHeli';
import { Vehicle, VehicleType } from '../types';

/** Deterministic rng: a fixed sequence, cycled. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const PLAYER = { x: 3000, y: 3000 };

function ctx(vehicles: Map<string, Vehicle>, over: Partial<HeliContext> = {}): HeliContext {
  return {
    vehicles,
    player: PLAYER,
    playerSpeed: 0,
    covered: false,
    dt: 1 / 60,
    roofAltAt: () => 0,
    ...over,
  };
}

function run(h: HeliSystem, c: HeliContext, seconds: number, onFire?: (hit: boolean) => void) {
  for (let i = 0; i < seconds * 60; i++) h.update(c, { fire: (_from, hit) => onFire?.(hit) });
}

let vehicles: Map<string, Vehicle>;
beforeEach(() => { vehicles = new Map(); });

describe('dispatch', () => {
  it('sends helicopters up to the target, spaced out', () => {
    const h = new HeliSystem(seq([0.1, 0.6]));
    h.setTarget(2, false);
    run(h, ctx(vehicles), 1);
    expect(h.units).toHaveLength(1);
    run(h, ctx(vehicles), 5);
    expect(h.units).toHaveLength(2);
    for (const u of h.units) {
      const v = vehicles.get(u.vehicleId)!;
      expect(v.type).toBe(VehicleType.POLICE_HELI);
      expect(v.altitude).toBeGreaterThanOrEqual(HELI_ALT - 1);
    }
  });

  it('peels off and removes the extras when the target drops', () => {
    const h = new HeliSystem(seq([0.3]));
    h.setTarget(1, false);
    run(h, ctx(vehicles), 1);
    h.setTarget(0, false);
    run(h, ctx(vehicles), 1);
    expect(h.units[0].state).toBe('retreat');
    run(h, ctx(vehicles), 14);
    expect(h.units).toHaveLength(0);
    expect(vehicles.size).toBe(0);
  });

  it('clear removes everything at once', () => {
    const h = new HeliSystem(seq([0.3]));
    h.setTarget(2, true);
    run(h, ctx(vehicles), 6);
    h.clear(vehicles);
    expect(h.units).toHaveLength(0);
    expect(vehicles.size).toBe(0);
    expect(h.seesPlayer).toBe(false);
  });
});

describe('flight', () => {
  it('closes on the player and circles them', () => {
    const h = new HeliSystem(seq([0.25]));
    h.setTarget(1, false);
    run(h, ctx(vehicles), 12);
    const v = vehicles.get(h.units[0].vehicleId)!;
    expect(Math.hypot(v.x - PLAYER.x, v.y - PLAYER.y)).toBeLessThan(250);
  });

  it('never exceeds its top speed', () => {
    const h = new HeliSystem(seq([0.25]));
    h.setTarget(1, false);
    run(h, ctx(vehicles), 0.5);
    const v = vehicles.get(h.units[0].vehicleId)!;
    let px = v.x, py = v.y;
    for (let i = 0; i < 300; i++) {
      h.update(ctx(vehicles), { fire: () => {} });
      const step = Math.hypot(v.x - px, v.y - py) * 60;
      expect(step).toBeLessThanOrEqual(HELI_SPEED + 1);
      px = v.x; py = v.y;
    }
  });

  it('climbs over tall rooftops', () => {
    const h = new HeliSystem(seq([0.25]));
    h.setTarget(1, false);
    run(h, ctx(vehicles, { roofAltAt: () => 280 }), 10);
    const v = vehicles.get(h.units[0].vehicleId)!;
    expect(v.altitude!).toBeGreaterThan(280);
  });
});

describe('spotting', () => {
  it('sees the player in range, and not under a roof', () => {
    const h = new HeliSystem(seq([0.25]));
    h.setTarget(1, false);
    run(h, ctx(vehicles), 12);
    expect(h.seesPlayer).toBe(true);

    run(h, ctx(vehicles, { covered: true }), 0.1);
    expect(h.seesPlayer).toBe(false);
  });

  it('loses the player beyond its sight range', () => {
    const h = new HeliSystem(seq([0.25]));
    h.setTarget(1, false);
    run(h, ctx(vehicles), 1);
    const v = vehicles.get(h.units[0].vehicleId)!;
    // Just spawned 700px out: too far to see yet.
    expect(Math.hypot(v.x - PLAYER.x, v.y - PLAYER.y)).toBeGreaterThan(HELI_SIGHT);
    expect(h.seesPlayer).toBe(false);
  });

  it('drags its searchlight behind a target that jumps away', () => {
    const h = new HeliSystem(seq([0.25]));
    h.setTarget(1, false);
    run(h, ctx(vehicles), 12);
    const u = h.units[0];
    expect(h.spotOn(u, PLAYER)).toBe(true);

    const moved = { x: PLAYER.x + 200, y: PLAYER.y };
    run(h, ctx(vehicles, { player: moved }), 0.1);
    expect(Math.hypot(u.spotX - moved.x, u.spotY - moved.y)).toBeGreaterThan(SPOT_RADIUS);
  });
});

describe('gunner', () => {
  it('holds fire below four stars', () => {
    const h = new HeliSystem(seq([0.25, 0.1]));
    h.setTarget(1, false);
    let shots = 0;
    run(h, ctx(vehicles), 20, () => shots++);
    expect(shots).toBe(0);
  });

  it('fires bursts once the light is on the player', () => {
    const h = new HeliSystem(seq([0.25, 0.1]));
    h.setTarget(1, true);
    const hits: boolean[] = [];
    run(h, ctx(vehicles), 20, hit => hits.push(hit));
    expect(hits.length).toBeGreaterThanOrEqual(6);
    // rng 0.1 < the hit chance of a stationary, close target.
    expect(hits.some(Boolean)).toBe(true);
  });

  it('cannot shoot what it cannot see', () => {
    const h = new HeliSystem(seq([0.25, 0.1]));
    h.setTarget(1, true);
    let shots = 0;
    run(h, ctx(vehicles, { covered: true }), 20, () => shots++);
    expect(shots).toBe(0);
  });

  it('misses a fast mover more often', () => {
    const slow = new HeliSystem(seq([0.25, 0.5]));
    slow.setTarget(1, true);
    const slowHits: boolean[] = [];
    run(slow, ctx(vehicles), 20, hit => slowHits.push(hit));

    const other = new Map<string, Vehicle>();
    const fast = new HeliSystem(seq([0.25, 0.5]));
    fast.setTarget(1, true);
    const fastHits: boolean[] = [];
    run(fast, ctx(other, { playerSpeed: 150 }), 20, hit => fastHits.push(hit));

    const rate = (xs: boolean[]) => xs.filter(Boolean).length / Math.max(1, xs.length);
    expect(rate(slowHits)).toBeGreaterThan(rate(fastHits));
  });
});
