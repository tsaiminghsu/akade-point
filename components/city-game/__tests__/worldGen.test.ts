import { describe, it, expect } from 'vitest';
import {
  generateWorld,
  findRoadPath,
  isWalkable,
  isDrivable,
  isSolidAtAltitude,
  nearestRoadTile,
  ALT_PER_FLOOR,
  ALT_ROOF_BUFFER,
} from '../worldGen';
import {
  ARENA_TILE_X0,
  ARENA_TILE_X1,
  ARENA_TILE_Y0,
  ARENA_TILE_Y1,
  DRONE_PAD,
  inArenaTile,
  isInsideArena,
} from '../droneArena';
import { inBaseTile } from '../militaryBase';
import {
  GRID_SIZE,
  TILE_SIZE,
  WORLD_CENTER_TILE,
  CHUNKS_PER_SIDE,
  TileType,
  WorldData,
} from '../types';

const world: WorldData = generateWorld(42);
const C = WORLD_CENTER_TILE;

function tileAt(gx: number, gy: number) {
  return world.grid[gy][gx];
}

describe('world layout at the current grid size', () => {
  it('lays a road every 8 tiles, minus the ones the arena and the base swallowed', () => {
    const perAxis = Math.ceil(GRID_SIZE / 8);
    const fullGrid = perAxis * GRID_SIZE * 2 - perAxis * perAxis;
    // Derived rather than hardcoded: the point of this test is to catch an
    // accidental layout change, so moving the arena must not need a new
    // magic number here.
    let swallowed = 0;
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        if (!inArenaTile(gx, gy) && !inBaseTile(gx, gy)) continue;
        if (gx % 8 === 0 || gy % 8 === 0) swallowed++;
      }
    }
    expect(swallowed).toBeGreaterThan(0);
    expect(world.roadTiles).toHaveLength(fullGrid - swallowed);
  });

  it('paves the drone arena as one unbroken field', () => {
    for (let gy = ARENA_TILE_Y0; gy <= ARENA_TILE_Y1; gy++) {
      for (let gx = ARENA_TILE_X0; gx <= ARENA_TILE_X1; gx++) {
        expect(tileAt(gx, gy).type).toBe(TileType.DRONE_FIELD);
      }
    }
  });

  it('keeps the roads around the arena so it stays reachable by car', () => {
    const ring = [
      [ARENA_TILE_X0 - 1, ARENA_TILE_Y0 + 4],
      [ARENA_TILE_X1 + 1, ARENA_TILE_Y0 + 4],
      [ARENA_TILE_X0 + 4, ARENA_TILE_Y0 - 1],
      [ARENA_TILE_X0 + 4, ARENA_TILE_Y1 + 1],
    ];
    for (const [gx, gy] of ring) {
      expect(isDrivable(world.grid, gx * TILE_SIZE + 20, gy * TILE_SIZE + 20)).toBe(true);
    }
  });

  it('leaves no derived point pointing into the arena', () => {
    // Missions draw objectives from roadTiles and shopPositions, so a stale
    // entry here would drop a delivery in the middle of the flying field.
    const pools: [string, { x: number; y: number }[]][] = [
      ['roadTiles', world.roadTiles],
      ['spawnPoints', world.spawnPoints],
      ['sidewalkTiles', world.sidewalkTiles],
      ['shopPositions', world.shopPositions],
    ];
    for (const [name, pool] of pools) {
      const inside = pool.filter(p => inArenaTile(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE)));
      expect(`${name}: ${inside.length}`).toBe(`${name}: 0`);
    }
    for (const block of world.parkingBlocks) {
      expect(isInsideArena(block.center.x, block.center.y)).toBe(false);
    }
  });

  it('puts the drone pad inside the arena on walkable ground', () => {
    expect(isInsideArena(world.dronePad.x, world.dronePad.y)).toBe(true);
    expect(world.dronePad).toEqual(DRONE_PAD);
    expect(isWalkable(world.grid, world.dronePad.x, world.dronePad.y)).toBe(true);
  });

  it('keeps the centre tile on an intersection', () => {
    expect(C % 8).toBe(0);
    expect(tileAt(C, C).type).toBe(TileType.INTERSECTION);
  });

  it('places the town hall campus relative to the centre', () => {
    // Body spans dx 1..7 / dy 2..6; the lobby (dx 3..5 / dy 2..4) is carved
    // out of it, so the row below the lobby is the first solid one.
    expect(tileAt(C + 4, C + 5).type).toBe(TileType.TOWN_HALL);
    expect(tileAt(C + 1, C + 2).type).toBe(TileType.TOWN_HALL);
    expect(tileAt(C + 4, C + 3).type).toBe(TileType.TOWN_HALL_INTERIOR);
    expect(tileAt(C + 4, C - 4).type).toBe(TileType.TOWN_HALL_PLAZA);
    // The road in front of the building is preserved.
    expect(tileAt(C + 4, C).type).toBe(TileType.ROAD_H);
  });

  it('respawns the player inside the walkable lobby', () => {
    expect(isWalkable(world.grid, world.respawnPos.x, world.respawnPos.y)).toBe(true);
    expect(isWalkable(world.grid, world.townHallPos.x, world.townHallPos.y)).toBe(true);
    // One tile south of the lobby is the solid building body.
    const solidY = world.townHallPos.y + TILE_SIZE * 2;
    expect(isSolidAtAltitude(world.grid, world.townHallPos.x, solidY, 0)).toBe(true);
  });

  it('keeps the helipad inside the map on a tall building', () => {
    expect(world.helipads).toHaveLength(1);
    const h = world.helipads[0];
    const t = tileAt(Math.floor(h.x / TILE_SIZE), Math.floor(h.y / TILE_SIZE));
    expect(t.type).toBe(TileType.HELIPAD);
    expect(t.floors).toBe(15);
  });

  it('puts every traffic spawn point on a road', () => {
    expect(world.spawnPoints.length).toBeGreaterThan(0);
    for (const p of world.spawnPoints) {
      expect(isDrivable(world.grid, p.x, p.y)).toBe(true);
    }
  });

  it('is deterministic for a seed', () => {
    const again = generateWorld(42);
    for (let gy = 0; gy < GRID_SIZE; gy += 3) {
      for (let gx = 0; gx < GRID_SIZE; gx += 3) {
        const a = world.grid[gy][gx];
        const b = again.grid[gy][gx];
        expect(b.type).toBe(a.type);
        expect(b.floors).toBe(a.floors);
        expect(b.colorSeed).toBe(a.colorSeed);
      }
    }
  });

  it('buckets every road tile into exactly one chunk', () => {
    expect(world.chunks).toHaveLength(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
    const total = world.roadTilesByChunk.reduce((n, b) => n + b.length, 0);
    expect(total).toBe(world.roadTiles.length);
  });
});

describe('altitude solidity', () => {
  it('clears a building once above its roof', () => {
    let found = false;
    for (let gy = 0; gy < GRID_SIZE && !found; gy++) {
      for (let gx = 0; gx < GRID_SIZE && !found; gx++) {
        const t = world.grid[gy][gx];
        if (t.type !== TileType.BUILDING) continue;
        const wx = gx * TILE_SIZE + 20;
        const wy = gy * TILE_SIZE + 20;
        const roof = (t.floors ?? 1) * ALT_PER_FLOOR + ALT_ROOF_BUFFER;
        expect(isSolidAtAltitude(world.grid, wx, wy, 0)).toBe(true);
        expect(isSolidAtAltitude(world.grid, wx, wy, roof - 1)).toBe(true);
        expect(isSolidAtAltitude(world.grid, wx, wy, roof + 1)).toBe(false);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('treats the map edge as solid and roads as open', () => {
    expect(isSolidAtAltitude(world.grid, -10, 100, 500)).toBe(true);
    const r = world.roadTiles[0];
    expect(isSolidAtAltitude(world.grid, r.x, r.y, 0)).toBe(false);
  });
});

describe('findRoadPath', () => {
  const a = world.roadTiles[10];
  const b = world.roadTiles[500];

  it('returns nothing when start and end share a tile', () => {
    expect(findRoadPath(world.grid, a.x, a.y, a.x + 3, a.y - 3)).toEqual([]);
  });

  it('ends at the destination and walks tile centres', () => {
    const path = findRoadPath(world.grid, a.x, a.y, b.x, b.y);
    expect(path.length).toBeGreaterThan(1);
    const last = path[path.length - 1];
    expect(last).toEqual(b);
    for (const p of path) {
      expect((p.x - TILE_SIZE / 2) % TILE_SIZE).toBe(0);
      expect((p.y - TILE_SIZE / 2) % TILE_SIZE).toBe(0);
    }
    // Consecutive points are 4-neighbours.
    let prev = a;
    for (const p of path) {
      expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBeLessThanOrEqual(TILE_SIZE + 1);
      prev = p;
    }
  });

  it('falls back to the raw destination when it is walled in', () => {
    // Deep inside a civic park block: every neighbour is PARK, which the BFS
    // does not traverse, so the destination is unreachable.
    const gx = C - 4;
    const gy = C - 4;
    expect(tileAt(gx, gy).type).toBe(TileType.PARK);
    const wx = gx * TILE_SIZE + 20;
    const wy = gy * TILE_SIZE + 20;
    expect(findRoadPath(world.grid, a.x, a.y, wx, wy)).toEqual([{ x: wx, y: wy }]);
  });

  it('is reusable across many searches without drift', () => {
    const first = findRoadPath(world.grid, a.x, a.y, b.x, b.y);
    for (let i = 0; i < 50; i++) findRoadPath(world.grid, b.x, b.y, world.roadTiles[i * 7].x, world.roadTiles[i * 7].y);
    const again = findRoadPath(world.grid, a.x, a.y, b.x, b.y);
    expect(again).toEqual(first);
  });
});

describe('nearestRoadTile', () => {
  it('finds a drivable tile from inside geometry', () => {
    const p = nearestRoadTile(world, world.townHallPos);
    expect(isDrivable(world.grid, p.x, p.y)).toBe(true);
  });
});
