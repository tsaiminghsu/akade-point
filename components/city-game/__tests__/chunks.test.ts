import { describe, it, expect } from 'vitest';
import { generateWorld, isDrivable } from '../worldGen';
import {
  LAYER_NAMES,
  LAMP_STRIDE,
  capacityFor,
  chunkDistSq3D,
  pickSpawnInRing,
  pickRoadBeyond,
} from '../chunks';
import {
  GRID_SIZE,
  TILE_SIZE,
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

  it('bakes every building exactly once across the four facade layers', () => {
    let buildings = 0;
    let houses1 = 0;
    let parksWithTree = 0;
    let lamps = 0;
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const t = world.grid[gy][gx];
        if (t.type === TileType.BUILDING || t.type === TileType.HELIPAD) buildings++;
        if (t.type === TileType.BUILDING && t.buildingType === BuildingType.HOUSE && (t.floors ?? 1) === 1) houses1++;
        if (t.type === TileType.PARK && (gx + gy * 3) % 3 === 0) parksWithTree++;
        if (gx % LAMP_STRIDE === 0 && gy % LAMP_STRIDE === 0
          && (t.type === TileType.SIDEWALK || t.type === TileType.INTERSECTION)) lamps++;
      }
    }
    const facades = sumLayer('sky') + sumLayer('off') + sumLayer('com') + sumLayer('hou');
    expect(facades).toBe(buildings);
    expect(sumLayer('roofBase')).toBe(buildings);
    expect(sumLayer('houseWin')).toBe(houses1 * 2);
    expect(sumLayer('houseDoor')).toBe(houses1);
    expect(sumLayer('treeTrunk')).toBe(parksWithTree);
    expect(sumLayer('treeLeaf')).toBe(parksWithTree);
    expect(sumLayer('lampPole')).toBe(lamps);
    const lampPositions = world.chunks.reduce((n, c) => n + c.lampPositions.length / 2, 0);
    expect(lampPositions).toBe(lamps);
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
