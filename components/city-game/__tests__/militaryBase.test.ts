import { describe, it, expect } from 'vitest';
import {
  BASE_TILE_X0,
  BASE_TILE_X1,
  BASE_TILE_Y0,
  BASE_TILE_Y1,
  BASE_X0,
  BASE_X1,
  BASE_Y0,
  BASE_Y1,
  GATES,
  STEALABLE_TANK,
  STRUCTURES,
  TANK_POSTS,
  TRUCK_POSTS,
  WALL_ALT,
  baseTile,
  clampToBaseInterior,
  distanceToBase,
  inBaseTile,
  isGateTile,
  isInsideBase,
} from '../militaryBase';
import { inArenaTile } from '../droneArena';
import {
  findRoadPath,
  generateWorld,
  getZoneName,
  isDrivable,
  isSolidAtAltitude,
  isWalkable,
  roofAltitudeAt,
} from '../worldGen';
import { TileType, TILE_SIZE, WorldData } from '../types';
import { ALL_COURSES } from '../raceCourses';

const world: WorldData = generateWorld(42);

const centre = (gx: number, gy: number) => ({ x: gx * TILE_SIZE + 20, y: gy * TILE_SIZE + 20 });

describe('layout', () => {
  it('walls the whole ring except the gates', () => {
    for (let gx = BASE_TILE_X0; gx <= BASE_TILE_X1; gx++) {
      for (let gy = BASE_TILE_Y0; gy <= BASE_TILE_Y1; gy++) {
        const ring = gx === BASE_TILE_X0 || gx === BASE_TILE_X1 || gy === BASE_TILE_Y0 || gy === BASE_TILE_Y1;
        if (!ring) continue;
        const t = baseTile(gx, gy)!;
        expect(t.type).toBe(isGateTile(gx, gy) ? TileType.MILITARY_BASE : TileType.MILITARY_WALL);
      }
    }
  });

  it('puts every gate in the wall ring, lined up with a swallowed road', () => {
    for (const g of GATES) {
      for (let gx = g.gx0; gx <= g.gx1; gx++) {
        for (let gy = g.gy0; gy <= g.gy1; gy++) {
          expect(inBaseTile(gx, gy)).toBe(true);
        }
      }
      // The middle of each gate sits on what was a road line.
      const mx = (g.gx0 + g.gx1) / 2;
      const my = (g.gy0 + g.gy1) / 2;
      expect(g.side === 'S' ? mx % 8 : my % 8).toBe(0);
    }
  });

  it('marks structures solid and gives them a height', () => {
    for (const s of STRUCTURES) {
      const t = baseTile(s.gx0, s.gy0)!;
      expect(t.type).toBe(TileType.MILITARY_HANGAR);
      expect(t.floors).toBe(s.floors);
    }
  });

  it('keeps structures clear of the wall ring and each other', () => {
    for (const s of STRUCTURES) {
      expect(s.gx0).toBeGreaterThan(BASE_TILE_X0);
      expect(s.gx1).toBeLessThan(BASE_TILE_X1);
      expect(s.gy0).toBeGreaterThan(BASE_TILE_Y0);
      expect(s.gy1).toBeLessThan(BASE_TILE_Y1);
    }
  });

  it('parks guards and the stealable tank on open apron', () => {
    for (const p of [...TANK_POSTS, ...TRUCK_POSTS, STEALABLE_TANK]) {
      expect(isInsideBase(p.x, p.y)).toBe(true);
      expect(isDrivable(world.grid, p.x, p.y)).toBe(true);
      const c = clampToBaseInterior(p.x, p.y);
      expect(c).toEqual({ x: p.x, y: p.y });
    }
  });

  it('does not overlap the drone arena or any race gate', () => {
    for (let gx = BASE_TILE_X0; gx <= BASE_TILE_X1; gx++) {
      for (let gy = BASE_TILE_Y0; gy <= BASE_TILE_Y1; gy++) {
        expect(inArenaTile(gx, gy)).toBe(false);
      }
    }
    for (const course of ALL_COURSES) {
      for (const g of course.gates) expect(isInsideBase(g.x, g.y)).toBe(false);
    }
  });
});

describe('geometry helpers', () => {
  it('isInsideBase covers the footprint, walls included', () => {
    expect(isInsideBase(BASE_X0, BASE_Y0)).toBe(true);
    expect(isInsideBase(BASE_X1 - 1, BASE_Y1 - 1)).toBe(true);
    expect(isInsideBase(BASE_X0 - 1, BASE_Y0)).toBe(false);
    expect(isInsideBase(BASE_X1, BASE_Y0)).toBe(false);
  });

  it('distanceToBase is zero inside and grows outside', () => {
    expect(distanceToBase((BASE_X0 + BASE_X1) / 2, (BASE_Y0 + BASE_Y1) / 2)).toBe(0);
    expect(distanceToBase(BASE_X0 - 100, (BASE_Y0 + BASE_Y1) / 2)).toBeCloseTo(100);
    expect(distanceToBase(BASE_X1 + 30, BASE_Y1 + 40)).toBeCloseTo(50);
  });

  it('clampToBaseInterior keeps points off the wall ring', () => {
    const c = clampToBaseInterior(BASE_X0 - 500, BASE_Y1 + 500);
    expect(c.x).toBeGreaterThan(BASE_X0 + TILE_SIZE);
    expect(c.y).toBeLessThan(BASE_Y1 - TILE_SIZE);
  });
});

describe('in the generated world', () => {
  it('matches the layout tile for tile', () => {
    for (let gx = BASE_TILE_X0; gx <= BASE_TILE_X1; gx++) {
      for (let gy = BASE_TILE_Y0; gy <= BASE_TILE_Y1; gy++) {
        expect(world.grid[gy][gx]).toEqual(baseTile(gx, gy));
      }
    }
  });

  it('opens every gate onto a drivable road outside', () => {
    for (const g of GATES) {
      const gx = Math.round((g.gx0 + g.gx1) / 2);
      const gy = Math.round((g.gy0 + g.gy1) / 2);
      const out = g.side === 'S' ? centre(gx, gy + 1) : centre(gx - 1, gy);
      expect(isDrivable(world.grid, out.x, out.y)).toBe(true);
      const gate = centre(gx, gy);
      expect(isDrivable(world.grid, gate.x, gate.y)).toBe(true);
      expect(isWalkable(world.grid, gate.x, gate.y)).toBe(true);
    }
  });

  it('leaves no civilian spawn or objective inside the base', () => {
    const pools: [string, { x: number; y: number }[]][] = [
      ['roadTiles', world.roadTiles],
      ['spawnPoints', world.spawnPoints],
      ['sidewalkTiles', world.sidewalkTiles],
      ['shopPositions', world.shopPositions],
    ];
    for (const [name, pool] of pools) {
      const inside = pool.filter(p => isInsideBase(p.x, p.y));
      expect(`${name}: ${inside.length}`).toBe(`${name}: 0`);
    }
    for (const b of world.parkingBlocks) expect(isInsideBase(b.center.x, b.center.y)).toBe(false);
  });

  it('names the zone', () => {
    const p = centre(132, 30);
    expect(getZoneName(world.grid, p.x, p.y)).toBe('軍事基地');
  });

  it('makes walls and hangars solid at ground level only', () => {
    const wall = centre(BASE_TILE_X0 + 3, BASE_TILE_Y0);
    expect(isWalkable(world.grid, wall.x, wall.y)).toBe(false);
    expect(isSolidAtAltitude(world.grid, wall.x, wall.y, 0)).toBe(true);
    expect(isSolidAtAltitude(world.grid, wall.x, wall.y, WALL_ALT + 1)).toBe(false);
    expect(roofAltitudeAt(world.grid, wall.x, wall.y)).toBe(WALL_ALT);

    const h = STRUCTURES[0];
    const hangar = centre(h.gx0, h.gy0);
    expect(isWalkable(world.grid, hangar.x, hangar.y)).toBe(false);
    expect(isSolidAtAltitude(world.grid, hangar.x, hangar.y, h.floors * 14)).toBe(true);
    expect(isSolidAtAltitude(world.grid, hangar.x, hangar.y, h.floors * 14 + 10)).toBe(false);
  });
});

describe('road search', () => {
  const south = GATES.find(g => g.side === 'S')!;
  const west = GATES.find(g => g.side === 'W')!;
  const outsideSouth = centre(south.gx0 + 1, south.gy0 + 1);
  const outsideWest = centre(west.gx0 - 1, west.gy0 + 1);

  it('never routes civilian traffic across the apron', () => {
    const path = findRoadPath(world.grid, outsideSouth.x, outsideSouth.y, outsideWest.x, outsideWest.y);
    expect(path.length).toBeGreaterThan(1);
    for (const p of path) expect(isInsideBase(p.x, p.y)).toBe(false);
  });

  it('lets a pursuit in through a gate when the target is inside', () => {
    const target = centre(132, 30);
    const path = findRoadPath(world.grid, outsideSouth.x, outsideSouth.y, target.x, target.y, { military: true });
    expect(path.length).toBeGreaterThan(1);
    const last = path[path.length - 1];
    expect(Math.hypot(last.x - target.x, last.y - target.y)).toBeLessThan(TILE_SIZE);
    // Every step is on something a car can actually drive.
    for (const p of path) expect(isDrivable(world.grid, p.x, p.y) || !isInsideBase(p.x, p.y)).toBe(true);
    // And it went in through a gate, not over the wall.
    const firstInside = path.find(p => isInsideBase(p.x, p.y))!;
    const gx = Math.floor(firstInside.x / TILE_SIZE);
    const gy = Math.floor(firstInside.y / TILE_SIZE);
    expect(isGateTile(gx, gy)).toBe(true);
  });
});
