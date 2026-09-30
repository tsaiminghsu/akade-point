import { describe, it, expect } from 'vitest';
import { generateWorld } from '../worldGen';
import { isStreetSidewalk, packGroundGrid, unpackGroundGrid } from '../groundTiles';
import { BuildingType, TileType, WorldData } from '../types';

const world: WorldData = generateWorld(42);

describe('ground grid hand-off to the worker', () => {
  it('round-trips everything the painter reads', () => {
    const grid = unpackGroundGrid(packGroundGrid(world.grid));
    expect(grid.length).toBe(world.grid.length);
    for (let gy = 0; gy < grid.length; gy++) {
      for (let gx = 0; gx < grid.length; gx++) {
        const a = world.grid[gy][gx];
        const b = grid[gy][gx];
        expect(b.type).toBe(a.type);
        expect(b.buildingType === BuildingType.HOUSE).toBe(a.buildingType === BuildingType.HOUSE);
      }
    }
  });

  it('packs into two small typed arrays', () => {
    const p = packGroundGrid(world.grid);
    expect(p.types.byteLength + p.houses.byteLength).toBe(world.grid.length ** 2 * 2);
  });

  it('keeps kerb-side and front-yard sidewalks apart after the trip', () => {
    const grid = unpackGroundGrid(packGroundGrid(world.grid));
    let street = 0;
    let yard = 0;
    for (let gy = 1; gy < grid.length - 1; gy++) {
      for (let gx = 1; gx < grid.length - 1; gx++) {
        if (grid[gy][gx].type !== TileType.SIDEWALK) continue;
        const s = isStreetSidewalk(grid, gx, gy);
        expect(s).toBe(isStreetSidewalk(world.grid, gx, gy));
        if (s) street++; else yard++;
      }
    }
    expect(street).toBeGreaterThan(0);
    expect(yard).toBeGreaterThan(0);
  });
});
