import { describe, it, expect } from 'vitest';
import { generateWorld, isDrivable } from '../worldGen';
import {
  LAYER_NAMES,
  hasSetback,
  treeAt,
  lampDir,
  signalCorner,
  capacityFor,
  chunkDistSq3D,
  pickSpawnInRing,
  pickRoadBeyond,
} from '../chunks';
import {
  GRID_SIZE,
  TILE_SIZE,
  TILE_3D,
  CHUNK_TILES,
  CHUNK_PX,
  CHUNKS_PER_SIDE,
  TileType,
  BuildingType,
  WorldData,
  chunkOf,
  chunkOfTile,
  chunkKey,
  toX3D,
  toZ3D,
} from '../types';

const world: WorldData = generateWorld(42);

/** Deterministic rng for reservoir sampling. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sumLayer(name: (typeof LAYER_NAMES)[number]) {
  return world.chunks.reduce((n, c) => n + c.layers[name].count, 0);
}

describe('chunk index', () => {
  it('covers the grid with square chunks', () => {
    expect(world.chunks).toHaveLength(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
    expect(GRID_SIZE % CHUNK_TILES).toBe(0);
    for (const c of world.chunks) expect(c.key).toBe(chunkKey(c.cx, c.cy));
  });

  it('bakes every building once, plus a second tier for set-back towers', () => {
    let buildings = 0;
    let setbacks = 0;
    let houses = 0;
    let storefronts = 0;
    let trees = 0;
    let lamps = 0;
    let signals = 0;
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const t = world.grid[gy][gx];
        const isHouse = t.buildingType === BuildingType.HOUSE;
        if (t.type === TileType.BUILDING || t.type === TileType.HELIPAD) buildings++;
        if (t.type === TileType.BUILDING && !isHouse && hasSetback(t.floors ?? 1, t.colorSeed ?? 0)) setbacks++;
        if (t.type === TileType.BUILDING && isHouse) houses++;
        if (t.type === TileType.BUILDING && !isHouse) storefronts++;
        if (treeAt(world.grid, gx, gy)) trees++;
        if (lampDir(world.grid, gx, gy)) lamps++;
        if (signalCorner(world.grid, gx, gy)) signals++;
      }
    }
    const facades = sumLayer('sky') + sumLayer('off') + sumLayer('com') + sumLayer('hou');
    expect(setbacks).toBeGreaterThan(0);
    expect(facades).toBe(buildings + setbacks);
    expect(sumLayer('roofBase')).toBe(buildings + setbacks);
    expect(sumLayer('roofPeak')).toBe(houses);
    expect(sumLayer('houseDoor')).toBe(houses);
    expect(sumLayer('shop')).toBe(storefronts);
    expect(sumLayer('treeTrunk')).toBe(trees);
    expect(sumLayer('treeLeaf')).toBe(trees);
    expect(lamps).toBeGreaterThan(0);
    expect(sumLayer('lampHead')).toBe(lamps);
    expect(sumLayer('lightPool')).toBe(lamps);
    expect(signals).toBeGreaterThan(0);
    expect(sumLayer('signalHead')).toBe(signals);
    // Each lamp and each signal is a mast plus an arm.
    expect(sumLayer('pole')).toBe((lamps + signals) * 2);
    const lampPositions = world.chunks.reduce((n, c) => n + c.lampPositions.length / 2, 0);
    expect(lampPositions).toBe(lamps);
  });

  it('hangs lamp heads and signal heads over the carriageway', () => {
    const tileAt3D = (x3: number, z3: number) => {
      const gx = Math.floor((x3 + GRID_SIZE * TILE_3D / 2) / TILE_3D);
      const gy = Math.floor((z3 + GRID_SIZE * TILE_3D / 2) / TILE_3D);
      return world.grid[gy]?.[gx];
    };
    const road = new Set([TileType.ROAD_H, TileType.ROAD_V, TileType.INTERSECTION]);
    for (const c of world.chunks) {
      for (const name of ['lampHead', 'signalHead'] as const) {
        const L = c.layers[name];
        for (let i = 0; i < L.count; i++) {
          const t = tileAt3D(L.mats[i * 16 + 12], L.mats[i * 16 + 14]);
          expect(road.has(t!.type)).toBe(true);
        }
      }
    }
  });

  it('staggers street lamps so the two sides of a road alternate', () => {
    // A north–south road column: lamps east and west of it never share a row.
    const gx = 8 * 3;
    const west = new Set<number>();
    const east = new Set<number>();
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      if (lampDir(world.grid, gx - 1, gy)) west.add(gy);
      if (lampDir(world.grid, gx + 1, gy)) east.add(gy);
    }
    expect(west.size).toBeGreaterThan(0);
    expect(east.size).toBeGreaterThan(0);
    for (const gy of west) expect(east.has(gy)).toBe(false);
  });

  it('runs the two crossing directions of a signal on opposite phases', () => {
    const phases = new Set<number>();
    for (const c of world.chunks) {
      const L = c.layers.signalHead;
      for (let i = 0; i < L.count; i++) phases.add(L.colors[i * 3]);
    }
    expect([...phases].sort()).toEqual([0, 0.5]);
  });

  it('merges the tiles of a multi-tile building into one mass', () => {
    // Find two horizontally adjacent tiles of the same non-house building.
    let found = false;
    for (let gy = 0; gy < GRID_SIZE && !found; gy++) {
      for (let gx = 0; gx + 1 < GRID_SIZE && !found; gx++) {
        const a = world.grid[gy][gx];
        const b = world.grid[gy][gx + 1];
        if (a.type !== TileType.BUILDING || b.type !== TileType.BUILDING) continue;
        if (a.buildingType === BuildingType.HOUSE || a.colorSeed !== b.colorSeed || a.floors !== b.floors) continue;
        if (hasSetback(a.floors ?? 1, a.colorSeed ?? 0)) continue;
        found = true;
        // The shared edge sits exactly on the tile boundary.
        const boundary = (gx + 1) * TILE_3D - GRID_SIZE * TILE_3D / 2;
        const edges: number[] = [];
        for (const ch of world.chunks) {
          for (const name of ['com', 'off', 'sky'] as const) {
            const L = ch.layers[name];
            for (let i = 0; i < L.count; i++) {
              const tx = L.mats[i * 16 + 12];
              const sx = L.mats[i * 16];
              const tz = L.mats[i * 16 + 14];
              const zc = gy * TILE_3D + TILE_3D / 2 - GRID_SIZE * TILE_3D / 2;
              if (Math.abs(tz - zc) > TILE_3D / 2) continue;
              if (Math.abs(tx + sx / 2 - boundary) < 1e-4) edges.push(1);
              if (Math.abs(tx - sx / 2 - boundary) < 1e-4) edges.push(2);
            }
          }
        }
        expect(edges).toContain(1);
        expect(edges).toContain(2);
      }
    }
    expect(found).toBe(true);
  });

  it('stores matrices with 16 floats and colours with 3 floats per instance', () => {
    for (const c of world.chunks) {
      for (const name of LAYER_NAMES) {
        const L = c.layers[name];
        expect(L.mats.length).toBe(L.count * 16);
        expect(L.colors.length).toBe(L.count * 3);
        if (L.count > 0) expect(L.mats[15]).toBe(1); // homogeneous w
      }
    }
  });

  it('keeps baked positions inside the chunk bounds', () => {
    for (const c of world.chunks) {
      const L = c.layers.sky.count ? c.layers.sky : c.layers.com;
      for (let i = 0; i < L.count; i++) {
        const tx = L.mats[i * 16 + 12];
        const tz = L.mats[i * 16 + 14];
        expect(tx).toBeGreaterThanOrEqual(c.minX3);
        expect(tx).toBeLessThanOrEqual(c.maxX3);
        expect(tz).toBeGreaterThanOrEqual(c.minZ3);
        expect(tz).toBeLessThanOrEqual(c.maxZ3);
      }
    }
  });

  it('sizes capacity to any streaming window, never the whole map', () => {
    const radius = 176;
    const cap = capacityFor(world.chunks, 'com', radius);
    expect(cap).toBeLessThan(sumLayer('com'));

    // Probe a dense window: the sum inside the radius must fit.
    const px3 = toX3D(world.townHallPos.x);
    const pz3 = toZ3D(world.townHallPos.y);
    let inside = 0;
    for (const c of world.chunks) {
      if (chunkDistSq3D(c, px3, pz3) <= radius * radius) inside += c.layers.com.count;
    }
    expect(cap).toBeGreaterThanOrEqual(inside);
  });
});

describe('chunk coordinate helpers', () => {
  it('round-trips world px to chunks', () => {
    const c = chunkOf(CHUNK_PX * 3 + 10, CHUNK_PX * 7 + 600);
    expect(c).toEqual({ cx: 3, cy: 7 });
    expect(chunkOfTile(3 * CHUNK_TILES + 2, 7 * CHUNK_TILES)).toEqual({ cx: 3, cy: 7 });
  });

  it('clamps out-of-range points to the edge chunks', () => {
    expect(chunkOf(-500, 1e9)).toEqual({ cx: 0, cy: CHUNKS_PER_SIDE - 1 });
  });
});

describe('pickSpawnInRing', () => {
  const p = world.townHallPos;

  it('returns a drivable tile inside the ring', () => {
    for (let i = 0; i < 40; i++) {
      const t = pickSpawnInRing(world, p.x, p.y, 380, 680, { rng: seeded(i) });
      expect(t).toBeDefined();
      const d = Math.hypot(t!.x - p.x, t!.y - p.y);
      expect(d).toBeGreaterThanOrEqual(380);
      expect(d).toBeLessThanOrEqual(680);
      expect(isDrivable(world.grid, t!.x, t!.y)).toBe(true);
    }
  });

  it('avoids the forward cone when a heading is given', () => {
    const angle = 0; // facing north (-y)
    for (let i = 0; i < 40; i++) {
      const t = pickSpawnInRing(world, p.x, p.y, 380, 680, { forwardAngle: angle, rng: seeded(100 + i) })!;
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      const dot = (dx / d) * Math.sin(angle) + (dy / d) * -Math.cos(angle);
      expect(dot).toBeLessThan(0.2);
    }
  });

  it('returns undefined when the ring holds no road', () => {
    // Deep in a civic park: the nearest road is more than 10 px away.
    const gx = Math.floor(p.x / TILE_SIZE) - 8;
    const gy = Math.floor(p.y / TILE_SIZE) - 8;
    expect(world.grid[gy][gx].type).toBe(TileType.PARK);
    expect(pickSpawnInRing(world, gx * TILE_SIZE + 20, gy * TILE_SIZE + 20, 0, 10)).toBeUndefined();
  });

  it('matches a brute-force scan of the ring', () => {
    const brute = world.roadTiles.filter(t => {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      return d >= 300 && d <= 500;
    });
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = pickSpawnInRing(world, p.x, p.y, 300, 500, { rng: seeded(500 + i) })!;
      seen.add(`${t.x},${t.y}`);
      expect(brute.some(b => b.x === t.x && b.y === t.y)).toBe(true);
    }
    // Reservoir sampling should spread over the pool, not stick to one tile.
    expect(seen.size).toBeGreaterThan(brute.length / 4);
  });
});

describe('pickRoadBeyond', () => {
  it('only returns tiles farther than the minimum distance', () => {
    const p = world.townHallPos;
    for (let i = 0; i < 40; i++) {
      const t = pickRoadBeyond(world, p.x, p.y, 500, seeded(i))!;
      expect(Math.hypot(t.x - p.x, t.y - p.y)).toBeGreaterThan(500);
      expect(isDrivable(world.grid, t.x, t.y)).toBe(true);
    }
  });
});
