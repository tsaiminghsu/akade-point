import { describe, it, expect } from 'vitest';
import {
  capsuleOverlap,
  resolveImpact,
  damageFor,
  massOf,
  CollisionSystem,
  Overlap,
  Impact,
  crushDamage,
  isGroundVehicle,
} from '../collision';
import { Vehicle, VehicleType } from '../types';

/**
 * The trap this module has to avoid: `Vehicle.speed` is px/second for the car
 * the player drives and px/FRAME for AI-driven cars. Several of these tests
 * exist purely to pin that conversion down.
 */

const FPS = 60;

function car(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v' + Math.random().toString(36).slice(2, 7),
    type: VehicleType.CAR,
    x: 0, y: 0, angle: 0,
    speed: 0, maxSpeed: 160,
    color: '#ffffff',
    width: 16, height: 26,
    occupant: 'npc',
    waypoints: [], waypointIndex: 0,
    hp: 100,
    vx: 0, vy: 0,
    ...over,
  };
}

function emptyOverlap(): Overlap {
  return { nx: 0, ny: 0, pen: 0 };
}

describe('damage curve', () => {
  it('ignores gentle contact and saturates on big hits', () => {
    expect(damageFor(0)).toBe(0);
    expect(damageFor(25)).toBe(0);
    expect(damageFor(20)).toBe(0);
    expect(damageFor(55)).toBeCloseTo(9, 5);
    expect(damageFor(10000)).toBe(60);
  });

  it('increases monotonically above the floor', () => {
    let prev = -1;
    for (let s = 25; s <= 300; s += 25) {
      const d = damageFor(s);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('mass', () => {
  it('makes wrecks immovable and police heavier than traffic', () => {
    expect(massOf(car({ hp: 0 }))).toBe(Infinity);
    expect(massOf(car({ type: VehicleType.POLICE }))).toBeGreaterThan(massOf(car()));
    expect(massOf(car({ isParked: true }))).toBeLessThan(massOf(car()));
  });
});

describe('capsule overlap', () => {
  it('detects a rear-end contact and misses a clear gap', () => {
    const a = car({ x: 100, y: 100 });
    const b = car({ x: 100, y: 84 });    // 16px ahead, bodies overlap
    const o = emptyOverlap();
    expect(capsuleOverlap(a, b, o)).toBe(true);
    expect(o.pen).toBeGreaterThan(0);

    const far = car({ x: 100, y: 40 });
    expect(capsuleOverlap(a, far, emptyOverlap())).toBe(false);
  });

  it('points the normal from a towards b', () => {
    const a = car({ x: 100, y: 100 });
    const b = car({ x: 112, y: 100 });
    const o = emptyOverlap();
    expect(capsuleOverlap(a, b, o)).toBe(true);
    expect(o.nx).toBeGreaterThan(0.5);
    expect(Math.abs(o.ny)).toBeLessThan(0.5);
  });
});

describe('impulse response', () => {
  it('pushes both cars apart and conserves momentum for equal masses', () => {
    // a drives north into a stationary b.
    const a = car({ x: 100, y: 100, occupant: 'player', vx: 0, vy: -100 });
    const b = car({ x: 100, y: 86, vx: 0, vy: 0 });
    const o = emptyOverlap();
    expect(capsuleOverlap(a, b, o)).toBe(true);

    const pBefore = (a.vy ?? 0) + (b.vy ?? 0);
    const imp = resolveImpact(a, b, o);
    expect(imp).not.toBeNull();

    // Equal masses, so total momentum along the normal is preserved.
    expect((a.vy ?? 0) + (b.vy ?? 0)).toBeCloseTo(pBefore, 4);
    // The struck car is now moving away, the striker has slowed.
    expect(b.vy!).toBeLessThan(-1);
    expect(a.vy!).toBeGreaterThan(-100);
  });

  it('does nothing when the pair is already separating', () => {
    // Only just touching. Placing them deeply interpenetrated would make the
    // deepest circle pair face the other way, which is not what is under test.
    const a = car({ x: 100, y: 100, vx: 0, vy: 50 });     // moving south
    const b = car({ x: 100, y: 80, vx: 0, vy: -50 });     // moving north
    const o = emptyOverlap();
    expect(capsuleOverlap(a, b, o)).toBe(true);
    expect(o.ny).toBeLessThan(0);                          // normal points a -> b
    // They overlap but are flying apart, so no impulse should be applied.
    expect(resolveImpact(a, b, o)).toBeNull();
  });

  it('barely moves a wreck but shoves the live car', () => {
    const live = car({ x: 100, y: 100, occupant: 'player', vx: 0, vy: -120 });
    const wreck = car({ x: 100, y: 86, hp: 0, vx: 0, vy: 0 });
    const o = emptyOverlap();
    expect(capsuleOverlap(live, wreck, o)).toBe(true);

    const wreckY = wreck.y;
    resolveImpact(live, wreck, o);
    expect(wreck.y).toBeCloseTo(wreckY, 6);   // immovable
    expect(live.vy!).toBeGreaterThan(-120);   // bounced back
  });

  it('writes speed back in each vehicle\'s own unit', () => {
    // Identical geometry, but one car is player-driven (px/s) and one is AI
    // (px/frame). The resulting `speed` fields must differ by ~60x.
    const mk = (occupant: Vehicle['occupant']) => {
      const a = car({ x: 100, y: 100, occupant, vx: 0, vy: -100 });
      const b = car({ x: 100, y: 86, vx: 0, vy: 0 });
      const o = emptyOverlap();
      capsuleOverlap(a, b, o);
      resolveImpact(a, b, o);
      return a.speed;
    };

    const playerSpeed = mk('player');
    const npcSpeed = mk('npc');
    expect(playerSpeed).not.toBe(0);
    expect(npcSpeed).toBeCloseTo(playerSpeed / FPS, 5);
  });
});

describe('CollisionSystem', () => {
  it('damages both cars and reports the impact', () => {
    const player = car({ id: 'p', x: 100, y: 100, occupant: 'player', vx: 0, vy: -200 });
    const npc = car({ id: 'n', x: 100, y: 86, vx: 0, vy: 0 });
    const vehicles = new Map([[player.id, player], [npc.id, npc]]);

    const impacts: Impact[] = [];
    new CollisionSystem().update({
      vehicles,
      playerVehicleId: 'p',
      nowMs: 1000,
      onImpact: i => impacts.push(i),
    });

    expect(impacts).toHaveLength(1);
    expect(player.hp).toBeLessThan(100);
    expect(npc.hp).toBeLessThan(100);
  });

  it('fires onDestroyed exactly once when hp reaches zero', () => {
    const player = car({ id: 'p', x: 100, y: 100, occupant: 'player', hp: 5, vx: 0, vy: -400 });
    const npc = car({ id: 'n', x: 100, y: 86, hp: 5, vx: 0, vy: 0 });
    const vehicles = new Map([[player.id, player], [npc.id, npc]]);

    const destroyed: string[] = [];
    const sys = new CollisionSystem();
    sys.update({
      vehicles, playerVehicleId: 'p', nowMs: 1000,
      onDestroyed: v => destroyed.push(v.id),
    });
    expect(destroyed.sort()).toEqual(['n', 'p']);

    // Already at zero: a second pass must not re-report them.
    destroyed.length = 0;
    sys.update({
      vehicles, playerVehicleId: 'p', nowMs: 1016,
      onDestroyed: v => destroyed.push(v.id),
    });
    expect(destroyed).toEqual([]);
  });

  it('ignores two NPCs that are not the player or police', () => {
    const a = car({ id: 'a', x: 100, y: 100, vx: 0, vy: -200 });
    const b = car({ id: 'b', x: 100, y: 86, vx: 0, vy: 0 });
    const vehicles = new Map([[a.id, a], [b.id, b]]);

    const impacts: Impact[] = [];
    new CollisionSystem().update({
      vehicles, playerVehicleId: null, nowMs: 1000,
      onImpact: i => impacts.push(i),
    });
    // NPC-vs-NPC separation is handled by traffic.ts, not here.
    expect(impacts).toEqual([]);
  });

  it('simulates police impacts even without the player involved', () => {
    const cop = car({ id: 'c', type: VehicleType.POLICE, x: 100, y: 100, vx: 0, vy: -200 });
    const npc = car({ id: 'n', x: 100, y: 86, vx: 0, vy: 0 });
    const vehicles = new Map([[cop.id, cop], [npc.id, npc]]);

    const impacts: Impact[] = [];
    new CollisionSystem().update({
      vehicles, playerVehicleId: null, nowMs: 1000,
      onImpact: i => impacts.push(i),
    });
    expect(impacts).toHaveLength(1);
  });

  it('skips aircraft entirely', () => {
    const player = car({ id: 'p', x: 100, y: 100, occupant: 'player', vx: 0, vy: -200 });
    const heli = car({ id: 'h', type: VehicleType.HELICOPTER, x: 100, y: 88 });
    const vehicles = new Map([[player.id, player], [heli.id, heli]]);

    const impacts: Impact[] = [];
    new CollisionSystem().update({
      vehicles, playerVehicleId: 'p', nowMs: 1000,
      onImpact: i => impacts.push(i),
    });
    expect(impacts).toEqual([]);
    expect(heli.hp).toBe(100);
  });
});

describe('heavy vehicles', () => {
  it('uses per-type mass and ignores the police helicopter', () => {
    expect(massOf(car({ type: VehicleType.TANK }))).toBeGreaterThan(massOf(car({ type: VehicleType.SWAT })));
    expect(massOf(car({ type: VehicleType.SWAT }))).toBeGreaterThan(massOf(car({ type: VehicleType.POLICE })));
    expect(isGroundVehicle(car({ type: VehicleType.POLICE_HELI }))).toBe(false);
  });

  it('a tank rolling into a car crushes it and barely notices', () => {
    const tank = car({ id: 't', type: VehicleType.TANK, x: 100, y: 100, occupant: 'player', vx: 0, vy: -80 });
    const victim = car({ id: 'n', x: 100, y: 78, vx: 0, vy: 0 });
    const vehicles = new Map([[tank.id, tank], [victim.id, victim]]);
    const destroyedBy: Array<[string, string | null]> = [];
    new CollisionSystem().update({
      vehicles, playerVehicleId: 't', nowMs: 1000,
      onDestroyed: (v, by) => destroyedBy.push([v.id, by?.id ?? null]),
    });
    expect(victim.hp).toBe(0);
    expect(destroyedBy).toEqual([['n', 't']]);
    expect(tank.hp).toBeGreaterThan(95);
  });

  it('crush damage needs real closing speed, and never applies tank to tank', () => {
    const tank = car({ type: VehicleType.TANK });
    expect(crushDamage(tank, car(), 5)).toBe(0);
    expect(crushDamage(tank, car(), 60)).toBeGreaterThan(50);
    expect(crushDamage(tank, car({ type: VehicleType.TANK }), 60)).toBe(0);
    expect(crushDamage(car(), tank, 60)).toBe(0);
  });

  it('armour scales collision damage', () => {
    const player = car({ id: 'p', x: 100, y: 100, occupant: 'player', vx: 0, vy: -200 });
    const swat = car({ id: 's', type: VehicleType.SWAT, x: 100, y: 84, vx: 0, vy: 0 });
    const vehicles = new Map([[player.id, player], [swat.id, swat]]);
    new CollisionSystem().update({ vehicles, playerVehicleId: 'p', nowMs: 1000 });
    expect(100 - swat.hp).toBeLessThan(100 - player.hp);
  });

  it('simulates SWAT and army impacts like police ones', () => {
    for (const type of [VehicleType.SWAT, VehicleType.ARMY_TRUCK, VehicleType.TANK]) {
      const unit = car({ id: 'u', type, x: 100, y: 100, vx: 0, vy: -200 });
      const npc = car({ id: 'n', x: 100, y: 82, vx: 0, vy: 0 });
      const impacts: Impact[] = [];
      new CollisionSystem().update({
        vehicles: new Map([[unit.id, unit], [npc.id, npc]]),
        playerVehicleId: null, nowMs: 1000,
        onImpact: i => impacts.push(i),
      });
      expect(impacts).toHaveLength(1);
    }
  });
});
