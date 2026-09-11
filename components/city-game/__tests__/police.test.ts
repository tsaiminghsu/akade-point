import { describe, it, expect, beforeEach } from 'vitest';
import { PoliceSystem, nearestRoadTile, SIGHT_RANGE } from '../police';
import { RouteCache } from '../gpsRoute';
import { generateWorld, isDrivable, findRoadPath } from '../worldGen';
import { Vehicle, VehicleType, WorldData, Waypoint, TILE_SIZE } from '../types';

const world: WorldData = generateWorld(42);

function ctx(
  police: PoliceSystem,
  vehicles: Map<string, Vehicle>,
  player: { x: number; y: number; state?: string },
  over: Partial<{ playerSpeed: number; playerVx: number; playerVy: number; dt: number }> = {},
) {
  return {
    world,
    vehicles,
    player: { x: player.x, y: player.y, state: player.state ?? 'inCar', speed: 0 },
    playerSpeed: over.playerSpeed ?? 0,
    playerVx: over.playerVx ?? 0,
    playerVy: over.playerVy ?? 0,
    dt: over.dt ?? 1 / 60,
    isSolidAt: () => false,
  };
}

let police: PoliceSystem;
let vehicles: Map<string, Vehicle>;

beforeEach(() => {
  police = new PoliceSystem();
  vehicles = new Map();
});

describe('nearestRoadTile', () => {
  it('returns a drivable tile for a point inside a building', () => {
    // Town Hall centre is solid; the nearest road must still be reachable.
    const p = nearestRoadTile(world, world.townHallPos);
    expect(isDrivable(world.grid, p.x, p.y)).toBe(true);
  });

  it('returns the tile itself when already on a road', () => {
    const road = world.roadTiles[0];
    const p = nearestRoadTile(world, road);
    expect(isDrivable(world.grid, p.x, p.y)).toBe(true);
    expect(Math.hypot(p.x - road.x, p.y - road.y)).toBeLessThan(TILE_SIZE);
  });
});

describe('dispatch', () => {
  it('spawns up to the target count, one unit at a time', () => {
    const player = world.roadTiles[100];
    police.setTarget(3);

    // Spawns are rate limited, so a single frame yields at most one unit.
    police.update(ctx(police, vehicles, player));
    expect(police.units.length).toBe(1);

    for (let i = 0; i < 60 * 6; i++) police.update(ctx(police, vehicles, player));
    expect(police.units.length).toBe(3);
    for (const u of police.units) {
      expect(vehicles.get(u.vehicleId)?.type).toBe(VehicleType.POLICE);
    }
  });

  it('spawns outside sight range so units never appear on top of the player', () => {
    const player = world.roadTiles[100];
    police.setTarget(2);
    for (let i = 0; i < 60 * 4; i++) police.update(ctx(police, vehicles, player));

    for (const u of police.units) {
      const v = vehicles.get(u.vehicleId)!;
      expect(Math.hypot(v.x - player.x, v.y - player.y)).toBeGreaterThan(SIGHT_RANGE);
    }
  });

  it('removes every unit and its vehicle when cleared', () => {
    const player = world.roadTiles[100];
    police.setTarget(2);
    for (let i = 0; i < 60 * 4; i++) police.update(ctx(police, vehicles, player));
    expect(vehicles.size).toBeGreaterThan(0);

    police.clear(vehicles);
    expect(police.units).toHaveLength(0);
    expect(vehicles.size).toBe(0);
  });
});

describe('arrest', () => {
  /** Park one unit right on top of a stationary player. */
  function stageArrest() {
    const player = world.roadTiles[100];
    police.setTarget(1);
    police.update(ctx(police, vehicles, player));
    const unit = police.units[0];
    const v = vehicles.get(unit.vehicleId)!;
    v.x = player.x + 10;
    v.y = player.y;
    return { player, unit, v };
  }

  it('busts a stopped player after the arrest timer elapses', () => {
    const { player, unit, v } = stageArrest();

    let result: 'busted' | null = null;
    for (let i = 0; i < 60 * 3 && !result; i++) {
      v.x = player.x + 10;   // hold station
      v.y = player.y;
      result = police.update(ctx(police, vehicles, player));
    }

    expect(unit.state).toBe('arrest');
    expect(result).toBe('busted');
  });

  it('cannot arrest a player who is driving away at speed', () => {
    const { player, v } = stageArrest();

    let result: 'busted' | null = null;
    for (let i = 0; i < 60 * 3 && !result; i++) {
      v.x = player.x + 10;
      v.y = player.y;
      result = police.update(ctx(police, vehicles, player, { playerSpeed: 120 }));
    }
    expect(result).toBeNull();
  });

  it('arrests an on-foot player regardless of speed', () => {
    const { player, v } = stageArrest();

    let result: 'busted' | null = null;
    for (let i = 0; i < 60 * 3 && !result; i++) {
      v.x = player.x + 10;
      v.y = player.y;
      result = police.update(
        ctx(police, vehicles, { ...player, state: 'onFoot' }, { playerSpeed: 120 }),
      );
    }
    expect(result).toBe('busted');
  });

  it('reports arrest progress while it is in flight', () => {
    const { player, v } = stageArrest();
    expect(police.arrestProgress()).toBe(0);

    for (let i = 0; i < 30; i++) {
      v.x = player.x + 10;
      v.y = player.y;
      police.update(ctx(police, vehicles, player));
    }
    const p = police.arrestProgress();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe('blips', () => {
  it('emits one blip per live unit', () => {
    const player = world.roadTiles[100];
    police.setTarget(2);
    for (let i = 0; i < 60 * 4; i++) police.update(ctx(police, vehicles, player));

    const blips = police.getBlips(vehicles);
    expect(blips).toHaveLength(police.units.length);
    for (const b of blips) expect(b.kind).toBe('police');
  });
});

describe('GPS route cache', () => {
  const wp = (x: number, y: number): Waypoint => ({ x, y, active: true, source: 'user' });

  it('returns null and clears when there is no waypoint', () => {
    const rc = new RouteCache();
    const start = world.roadTiles[10];
    rc.update(world.grid, start, wp(world.roadTiles[80].x, world.roadTiles[80].y));
    expect(rc.points).not.toBeNull();

    rc.update(world.grid, start, { x: 0, y: 0, active: false });
    expect(rc.points).toBeNull();
  });

  it('produces a route that ends at the destination tile', () => {
    const rc = new RouteCache();
    const start = world.roadTiles[10];
    const dest = world.roadTiles[80];
    const route = rc.update(world.grid, start, wp(dest.x, dest.y))!;

    expect(route.length).toBeGreaterThan(0);
    const last = route[route.length - 1];
    expect(Math.hypot(last.x - dest.x, last.y - dest.y)).toBeLessThan(TILE_SIZE);
  });

  it('does not re-run the search while the player follows the route', () => {
    const rc = new RouteCache();
    const start = world.roadTiles[10];
    const dest = world.roadTiles[80];
    const first = rc.update(world.grid, start, wp(dest.x, dest.y))!;
    const firstLength = first.length;

    // Standing still on the same tile: the route must be the same array,
    // trimmed at most, never rebuilt longer.
    const again = rc.update(world.grid, start, wp(dest.x, dest.y))!;
    expect(again.length).toBeLessThanOrEqual(firstLength);
  });

  it('trims points the player has already passed', () => {
    const rc = new RouteCache();
    const start = world.roadTiles[10];
    const dest = world.roadTiles[80];
    const route = rc.update(world.grid, start, wp(dest.x, dest.y))!;
    expect(route.length).toBeGreaterThan(2);

    // Walk onto the third point of the route.
    const advanced = route[2];
    const trimmed = rc.update(world.grid, advanced, wp(dest.x, dest.y))!;
    expect(trimmed.length).toBeLessThan(route.length);
  });

  it('recomputes when the destination changes', () => {
    const rc = new RouteCache();
    const start = world.roadTiles[10];
    const a = rc.update(world.grid, start, wp(world.roadTiles[80].x, world.roadTiles[80].y))!;
    const b = rc.update(world.grid, start, wp(world.roadTiles[300].x, world.roadTiles[300].y))!;
    expect(b).not.toBe(a);

    const direct = findRoadPath(
      world.grid, start.x, start.y,
      world.roadTiles[300].x, world.roadTiles[300].y,
    );
    expect(b.length).toBe(direct.length);
  });

  it('recomputes when the player strays off the route', () => {
    const rc = new RouteCache();
    const start = world.roadTiles[10];
    const dest = world.roadTiles[80];
    const first = rc.update(world.grid, start, wp(dest.x, dest.y))!;

    // Jump somewhere the route never covered.
    const off = world.roadTiles[500];
    const second = rc.update(world.grid, off, wp(dest.x, dest.y))!;
    expect(second).not.toBe(first);
    expect(second.length).toBeGreaterThan(0);
  });
});
