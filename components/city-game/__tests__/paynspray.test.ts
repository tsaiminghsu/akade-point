import { describe, it, expect } from 'vitest';
import { createGarages, updateGarages, garageBlips, GARAGE_RADIUS, GARAGE_MAX_SPEED, GarageContext } from '../paynspray';
import { generateWorld, isDrivable } from '../worldGen';
import { Vehicle, VehicleType, WorldData } from '../types';

const world: WorldData = generateWorld(42);

function makeVehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1', type: VehicleType.CAR, x: 0, y: 0, angle: 0, speed: 0, maxSpeed: 160,
    color: '#0bc', width: 16, height: 26, occupant: 'player',
    waypoints: [], waypointIndex: 0, hp: 60,
    ...over,
  };
}

describe('createGarages', () => {
  it('places every garage on a drivable tile', () => {
    const garages = createGarages(world);
    expect(garages.length).toBeGreaterThan(0);
    for (const g of garages) {
      expect(isDrivable(world.grid, g.x, g.y)).toBe(true);
      expect(g.readyAt).toBe(0);
    }
  });

  it('spreads garages out rather than clustering them', () => {
    const garages = createGarages(world);
    expect(garages.length).toBeGreaterThanOrEqual(2);
    // Every pair should be meaningfully apart — the greedy farthest-point
    // placement should not leave two garages next to each other.
    for (let i = 0; i < garages.length; i++) {
      for (let j = i + 1; j < garages.length; j++) {
        const d = Math.hypot(garages[i].x - garages[j].x, garages[i].y - garages[j].y);
        expect(d).toBeGreaterThan(100);
      }
    }
  });

  it('assigns stable sequential ids starting at 0', () => {
    const garages = createGarages(world);
    expect(garages.map(g => g.id)).toEqual(garages.map((_, i) => i));
  });

  it('is deterministic for the same world', () => {
    const a = createGarages(world);
    const b = createGarages(generateWorld(42));
    expect(a).toEqual(b);
  });
});

describe('updateGarages', () => {
  function ctx(over: Partial<GarageContext> = {}): GarageContext {
    return {
      player: { x: 0, y: 0, state: 'inCar' },
      vehicle: makeVehicle(),
      speed: 0,
      wantedStars: 0,
      nowMs: 1000,
      charge: () => true,
      onServiced: () => {},
      ...over,
    };
  }

  it('does nothing when not in a car', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    expect(updateGarages(garages, ctx({ player: { x: 0, y: 0, state: 'onFoot' } }))).toBeNull();
  });

  it('does nothing above the pull-in speed limit', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    expect(updateGarages(garages, ctx({ speed: GARAGE_MAX_SPEED + 1 }))).toBeNull();
  });

  it('does nothing when the car needs no work and the player is clean', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    expect(updateGarages(garages, ctx({ vehicle: makeVehicle({ hp: 100 }), wantedStars: 0 }))).toBeNull();
  });

  it('services a damaged car within radius and charges the fee', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    const v = makeVehicle({ hp: 40 });
    let charged = false;
    let serviced: number | null = null;
    const result = updateGarages(garages, ctx({
      vehicle: v,
      charge: () => { charged = true; return true; },
      onServiced: g => { serviced = g.id; },
    }));
    expect(result).toBe(garages[0]);
    expect(charged).toBe(true);
    expect(v.hp).toBe(100);
    expect(serviced).toBe(0);
  });

  it('clears a wanted level even with an undamaged car', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    const v = makeVehicle({ hp: 100 });
    const result = updateGarages(garages, ctx({ vehicle: v, wantedStars: 3 }));
    expect(result).toBe(garages[0]);
  });

  it('is out of range beyond GARAGE_RADIUS', () => {
    const garages = [{ id: 0, x: GARAGE_RADIUS + 10, y: 0, readyAt: 0 }];
    expect(updateGarages(garages, ctx())).toBeNull();
  });

  it('is right at the edge of the radius', () => {
    const garages = [{ id: 0, x: GARAGE_RADIUS - 1, y: 0, readyAt: 0 }];
    expect(updateGarages(garages, ctx())).not.toBeNull();
  });

  it('refuses service and returns null when the player cannot pay', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    const v = makeVehicle({ hp: 20 });
    const result = updateGarages(garages, ctx({ vehicle: v, charge: () => false }));
    expect(result).toBeNull();
    expect(v.hp).toBe(20); // unchanged — no free repair
  });

  it('sets a cooldown that blocks the next attempt', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    const v = makeVehicle({ hp: 10 });
    updateGarages(garages, ctx({ vehicle: v, nowMs: 1000 }));
    expect(garages[0].readyAt).toBe(21000); // 1000 + 20s cooldown

    v.hp = 10; // damaged again immediately
    const second = updateGarages(garages, ctx({ vehicle: v, nowMs: 1500 }));
    expect(second).toBeNull();
  });

  it('serves again once the cooldown has elapsed', () => {
    const garages = [{ id: 0, x: 0, y: 0, readyAt: 0 }];
    updateGarages(garages, ctx({ vehicle: makeVehicle({ hp: 10 }), nowMs: 1000 }));
    const v2 = makeVehicle({ hp: 10 });
    const result = updateGarages(garages, ctx({ vehicle: v2, nowMs: 21001 }));
    expect(result).toBe(garages[0]);
  });

  it('tries the next garage when the nearest is on cooldown', () => {
    const garages = [
      { id: 0, x: 0, y: 0, readyAt: 5000 },
      { id: 1, x: 5, y: 0, readyAt: 0 },
    ];
    const v = makeVehicle({ hp: 10 });
    const result = updateGarages(garages, ctx({ vehicle: v, nowMs: 1000 }));
    expect(result).toBe(garages[1]);
  });
});

describe('garageBlips', () => {
  it('colours ready garages differently from cooling-down ones', () => {
    const garages = [
      { id: 0, x: 1, y: 2, readyAt: 0 },
      { id: 1, x: 3, y: 4, readyAt: 5000 },
    ];
    const blips = garageBlips(garages, 1000);
    expect(blips).toHaveLength(2);
    expect(blips[0]).toMatchObject({ x: 1, y: 2, kind: 'paynspray', color: '#22d3ee' });
    expect(blips[1]).toMatchObject({ x: 3, y: 4, kind: 'paynspray', color: '#4a5568' });
  });
});
