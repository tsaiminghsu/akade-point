import { describe, it, expect, beforeEach } from 'vitest';
import { PedestrianSystem } from '../pedestrians';
import { generateWorld, getTileAt } from '../worldGen';
import { TileType, Vehicle, VehicleType, WorldData, Pedestrian } from '../types';

const world: WorldData = generateWorld(42);

/** Tile types a wandering pedestrian is allowed to stand on. */
const PED_TILES = new Set([
  TileType.SIDEWALK,
  TileType.PARK,
  TileType.PARKING,
  TileType.TOWN_HALL_PLAZA,
  TileType.TOWN_HALL_INTERIOR,
]);

function makeCar(x: number, y: number, vx: number, vy: number): Vehicle {
  return {
    id: 'test-car',
    type: VehicleType.CAR,
    x, y,
    angle: Math.atan2(vx, -vy),
    speed: 0,
    maxSpeed: 160,
    color: '#ffffff',
    width: 16,
    height: 26,
    occupant: 'player',
    waypoints: [],
    waypointIndex: 0,
    hp: 100,
    vx, vy,
  };
}

function ctxFor(peds: PedestrianSystem, vehicles: Map<string, Vehicle>, opts: Partial<{
  px: number; py: number; maxPeds: number; playerVehicleId: string | null;
  onHit: (p: Pedestrian) => void;
}> = {}) {
  return {
    player: { x: opts.px ?? 1600, y: opts.py ?? 1600, angle: 0, state: 'inCar' },
    playerVehicleId: opts.playerVehicleId ?? null,
    vehicles,
    world,
    maxPeds: opts.maxPeds ?? 0,
    onHitByPlayer: opts.onHit,
  };
}

let peds: PedestrianSystem;

beforeEach(() => {
  peds = new PedestrianSystem(world, 128);
});

describe('spawning', () => {
  it('places pedestrians only on walkable non-road tiles', () => {
    peds.populate(1600, 1600, 60);
    expect(peds.count).toBeGreaterThan(0);

    for (const p of peds.peds) {
      if (!p.active) continue;
      const tile = getTileAt(world.grid, p.x, p.y);
      expect(tile).not.toBeNull();
      expect(PED_TILES.has(tile!.type)).toBe(true);
    }
  });

  it('tops up towards maxPeds and never exceeds capacity', () => {
    const vehicles = new Map<string, Vehicle>();
    for (let i = 0; i < 200; i++) {
      peds.update(1 / 60, ctxFor(peds, vehicles, { maxPeds: 40 }));
    }
    expect(peds.count).toBeGreaterThan(0);
    expect(peds.count).toBeLessThanOrEqual(40);
    expect(peds.peds.length).toBe(128);
  });

  it('despawns pedestrians left far behind', () => {
    peds.populate(1600, 1600, 40);
    const before = peds.count;
    expect(before).toBeGreaterThan(0);

    const vehicles = new Map<string, Vehicle>();
    // Teleport the player far away; the ring check runs every 10 frames.
    for (let i = 0; i < 20; i++) {
      peds.update(1 / 60, ctxFor(peds, vehicles, { px: 100, py: 100, maxPeds: 0 }));
    }
    expect(peds.count).toBeLessThan(before);
  });
});

describe('spatial query', () => {
  it('returns exactly the pedestrians inside the radius', () => {
    peds.populate(1600, 1600, 60);
    // Force the hash to be built.
    peds.update(1 / 60, ctxFor(peds, new Map()));

    const centre = peds.peds.find(p => p.active)!;
    const out: number[] = [];
    const n = peds.queryCircle(centre.x, centre.y, 50, out);

    const expected = peds.peds.filter(
      p => p.active && Math.hypot(p.x - centre.x, p.y - centre.y) <= 50,
    ).length;
    expect(n).toBe(expected);
    expect(n).toBeGreaterThan(0);
  });
});

describe('vehicle impacts', () => {
  /**
   * Put exactly one pedestrian under a moving car and run a single tick.
   * Everyone else is deactivated first: a bystander standing inside the same
   * car body would legitimately be knocked down too, which makes hit counts
   * non-deterministic.
   */
  function stageHit(speed: number, playerVehicleId: string | null = null, onHit?: (p: Pedestrian) => void) {
    peds.populate(1600, 1600, 20);
    peds.update(1 / 60, ctxFor(peds, new Map()));      // build the spatial hash
    const victim = peds.peds.find(p => p.active)!;
    for (const p of peds.peds) {
      if (p !== victim) p.active = false;
    }

    // Car sits on the pedestrian, travelling north at `speed`.
    const car = makeCar(victim.x, victim.y, 0, -speed);
    const vehicles = new Map<string, Vehicle>([[car.id, car]]);
    peds.update(1 / 60, ctxFor(peds, vehicles, { playerVehicleId, onHit }));
    return victim;
  }

  it('knocks a pedestrian down above the threshold speed', () => {
    const victim = stageHit(120);
    expect(victim.state).toBe('knocked');
    expect(victim.hitCooldown).toBeGreaterThan(0);
  });

  it('only shoves, never knocks down, below the threshold speed', () => {
    const victim = stageHit(10);
    expect(victim.state).not.toBe('knocked');
  });

  it('attributes the hit only when the player is driving', () => {
    let hits = 0;
    stageHit(120, 'test-car', () => { hits++; });
    expect(hits).toBe(1);

    const peds2 = new PedestrianSystem(world, 128);
    peds = peds2;
    let otherHits = 0;
    stageHit(120, null, () => { otherHits++; });
    expect(otherHits).toBe(0);
  });

  it('gets back up and flees after being knocked down', () => {
    const victim = stageHit(120);
    expect(victim.state).toBe('knocked');

    const vehicles = new Map<string, Vehicle>();
    // knocked (~2s+) -> getup (0.6s) -> flee
    for (let i = 0; i < 60 * 8; i++) {
      peds.update(1 / 60, ctxFor(peds, vehicles));
      if (victim.state === 'flee' || victim.state === 'walk') break;
    }
    expect(['flee', 'walk']).toContain(victim.state);
    expect(victim.fallT).toBe(0);
  });

  it('scares nearby pedestrians into fleeing', () => {
    peds.populate(1600, 1600, 60);
    peds.update(1 / 60, ctxFor(peds, new Map()));

    // Place a bystander next to the victim rather than trusting the random
    // spawn to have put someone within range.
    const active = peds.peds.filter(p => p.active);
    const victim = active[0];
    const bystander = active[1];
    bystander.x = victim.x + 30;
    bystander.y = victim.y;
    bystander.state = 'walk';
    peds.update(1 / 60, ctxFor(peds, new Map()));   // rebuild the spatial hash

    peds.panicAround(victim.x, victim.y, 120);
    expect(bystander.state).toBe('flee');
  });
});

describe('traffic integration', () => {
  /**
   * Leave exactly one pedestrian active, so the cone test cannot be perturbed
   * by a bystander wandering into range.
   */
  function isolateOne() {
    peds.populate(1600, 1600, 40);
    peds.update(1 / 60, ctxFor(peds, new Map()));
    const target = peds.peds.find(p => p.active)!;
    for (const p of peds.peds) {
      if (p !== target) p.active = false;
    }
    peds.update(1 / 60, ctxFor(peds, new Map()));   // rebuild the spatial hash
    return target;
  }

  it('reports a pedestrian standing in the vehicle path', () => {
    const target = isolateOne();

    // Car 40px south of the pedestrian, pointing north (angle 0).
    const car = makeCar(target.x, target.y + 40, 0, -50);
    car.angle = 0;
    const d = peds.forwardPedDistance(car, 90);
    expect(d).toBeLessThan(90);
    expect(d).toBeGreaterThan(30);
  });

  it('ignores pedestrians behind the vehicle', () => {
    const target = isolateOne();

    // Same geometry, but the car faces away (south).
    const car = makeCar(target.x, target.y + 40, 0, 50);
    car.angle = Math.PI;
    expect(peds.forwardPedDistance(car, 90)).toBe(90);
  });
});
