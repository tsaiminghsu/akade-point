import { describe, it, expect } from 'vitest';
import { generateWorld, isDrivable } from '../worldGen';
import {
  ensureTraffic,
  isLiveNpcCar,
  createNPCCar,
  updateTraffic,
  TRAFFIC_RESPAWN_MIN,
  TRAFFIC_DESPAWN_DISTANCE,
} from '../traffic';
import { Vehicle, VehicleType, WorldData } from '../types';

const world: WorldData = generateWorld(42);
const player = { x: world.townHallPos.x, y: world.townHallPos.y - 200, angle: 0 };

function liveCount(vehicles: Map<string, Vehicle>) {
  let n = 0;
  for (const v of vehicles.values()) if (isLiveNpcCar(v)) n++;
  return n;
}

describe('ensureTraffic', () => {
  it('tops the fleet up to the target, a couple of cars per call', () => {
    const vehicles = new Map<string, Vehicle>();
    const after = ensureTraffic(vehicles, world, player, 10);
    expect(after).toBeLessThanOrEqual(2);
    for (let i = 0; i < 20; i++) ensureTraffic(vehicles, world, player, 10);
    expect(liveCount(vehicles)).toBe(10);
  });

  it('never exceeds the target', () => {
    const vehicles = new Map<string, Vehicle>();
    for (let i = 0; i < 30; i++) ensureTraffic(vehicles, world, player, 6);
    expect(liveCount(vehicles)).toBe(6);
  });

  it('spawns out of the player\'s immediate view', () => {
    const vehicles = new Map<string, Vehicle>();
    for (let i = 0; i < 20; i++) ensureTraffic(vehicles, world, player, 12);
    for (const v of vehicles.values()) {
      const d = Math.hypot(v.x - player.x, v.y - player.y);
      // Lane offset can shave a few px off the ring distance.
      expect(d).toBeGreaterThanOrEqual(TRAFFIC_RESPAWN_MIN - 12);
      expect(v.waypoints.length).toBeGreaterThan(0);
    }
  });

  it('trims the farthest car when the target is lowered', () => {
    const vehicles = new Map<string, Vehicle>();
    for (let i = 0; i < 20; i++) ensureTraffic(vehicles, world, player, 8);
    // Push one car far away so it is eligible for trimming.
    const far = [...vehicles.values()][0];
    far.x = player.x + TRAFFIC_DESPAWN_DISTANCE + 200;
    far.y = player.y;
    ensureTraffic(vehicles, world, player, 4);
    expect(liveCount(vehicles)).toBe(7);
    expect(vehicles.has(far.id)).toBe(false);
  });

  it('ignores parked, wrecked, stolen and service cars when counting', () => {
    const vehicles = new Map<string, Vehicle>();
    for (let i = 0; i < 20; i++) ensureTraffic(vehicles, world, player, 4);
    const cars = [...vehicles.values()];
    cars[0].hp = 0;
    cars[1].isParked = true;
    cars[2].npcState = 'hijacked';
    expect(liveCount(vehicles)).toBe(1);
    for (let i = 0; i < 10; i++) ensureTraffic(vehicles, world, player, 4);
    expect(liveCount(vehicles)).toBe(4);
  });
});

describe('createNPCCar', () => {
  it('starts on a road with a route to follow', () => {
    for (let i = 0; i < 10; i++) {
      const v = createNPCCar(world, i);
      expect(v.type).toBe(VehicleType.NPC_CAR);
      expect(v.waypoints.length).toBeGreaterThan(0);
      // The lane offset moves the car 9 px off the tile centre, still on the road.
      expect(isDrivable(world.grid, v.x, v.y)).toBe(true);
    }
  });
});

describe('updateTraffic re-route budget', () => {
  it('eventually routes every car even when many finish at once', () => {
    const vehicles = new Map<string, Vehicle>();
    for (let i = 0; i < 12; i++) {
      const v = createNPCCar(world, i);
      v.waypoints = [];
      v.waypointIndex = 0;
      v.npcState = 'driving';
      vehicles.set(v.id, v);
    }
    // Twelve cars need a route on the same frame; the budget spreads them out.
    for (let f = 0; f < 30; f++) {
      updateTraffic(vehicles, world, 1 / 60, player.x, player.y, player.angle);
    }
    for (const v of vehicles.values()) {
      expect(v.waypoints.length).toBeGreaterThan(0);
    }
  });
});
