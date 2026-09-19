import { describe, it, expect } from 'vitest';
import {
  ARENA_CEILING,
  ARENA_TILE_X0,
  ARENA_TILE_X1,
  ARENA_TILE_Y0,
  ARENA_TILE_Y1,
  ARENA_X0,
  ARENA_X1,
  ARENA_Y0,
  ARENA_Y1,
  DRONE_ARENA,
  DRONE_PAD,
  clampToArena,
  droneConfinement,
  inArenaTile,
  isInsideArena,
} from '../droneArena';
import { TILE_SIZE, WORLD_SIZE } from '../types';
import type { RacePhase, RaceSession } from '../types';

function session(phase: RacePhase): RaceSession {
  return { phase } as RaceSession;
}

describe('arena geometry', () => {
  it('sits inside the world with room to spare', () => {
    expect(ARENA_X0).toBeGreaterThan(0);
    expect(ARENA_Y1).toBeLessThan(WORLD_SIZE);
    expect(ARENA_X1).toBeGreaterThan(ARENA_X0);
    expect(ARENA_Y1).toBeGreaterThan(ARENA_Y0);
  });

  it('is a square field of whole tiles', () => {
    expect(ARENA_X1 - ARENA_X0).toBe(ARENA_Y1 - ARENA_Y0);
    expect((ARENA_X1 - ARENA_X0) % TILE_SIZE).toBe(0);
  });

  it('keeps the ceiling below the global altitude limit, so it actually bites', () => {
    expect(ARENA_CEILING).toBeLessThan(200);
    expect(DRONE_ARENA.ceiling).toBe(ARENA_CEILING);
  });

  it('holds the walls inside the footprint so the drone stops short of clipping', () => {
    expect(DRONE_ARENA.minX).toBeGreaterThan(ARENA_X0);
    expect(DRONE_ARENA.maxX).toBeLessThan(ARENA_X1);
    expect(DRONE_ARENA.minY).toBeGreaterThan(ARENA_Y0);
    expect(DRONE_ARENA.maxY).toBeLessThan(ARENA_Y1);
  });

  it('puts the pad at the centre of the field', () => {
    expect(DRONE_PAD.x).toBeCloseTo((ARENA_X0 + ARENA_X1) / 2, 6);
    expect(DRONE_PAD.y).toBeCloseTo((ARENA_Y0 + ARENA_Y1) / 2, 6);
    expect(isInsideArena(DRONE_PAD.x, DRONE_PAD.y)).toBe(true);
  });
});

describe('inArenaTile', () => {
  it('covers every corner of the tile rectangle', () => {
    for (const [gx, gy] of [
      [ARENA_TILE_X0, ARENA_TILE_Y0], [ARENA_TILE_X1, ARENA_TILE_Y0],
      [ARENA_TILE_X0, ARENA_TILE_Y1], [ARENA_TILE_X1, ARENA_TILE_Y1],
    ]) {
      expect(inArenaTile(gx, gy)).toBe(true);
    }
  });

  it('excludes the ring of tiles just outside, which is where the roads live', () => {
    expect(inArenaTile(ARENA_TILE_X0 - 1, ARENA_TILE_Y0)).toBe(false);
    expect(inArenaTile(ARENA_TILE_X1 + 1, ARENA_TILE_Y1)).toBe(false);
    expect(inArenaTile(ARENA_TILE_X0, ARENA_TILE_Y0 - 1)).toBe(false);
    expect(inArenaTile(ARENA_TILE_X0, ARENA_TILE_Y1 + 1)).toBe(false);
  });

  it('agrees that the perimeter tiles are on the block grid', () => {
    expect((ARENA_TILE_X0 - 1) % 8).toBe(0);
    expect((ARENA_TILE_X1 + 1) % 8).toBe(0);
    expect((ARENA_TILE_Y0 - 1) % 8).toBe(0);
    expect((ARENA_TILE_Y1 + 1) % 8).toBe(0);
  });
});

describe('isInsideArena', () => {
  it('accepts the middle and rejects the city around it', () => {
    expect(isInsideArena(DRONE_PAD.x, DRONE_PAD.y)).toBe(true);
    expect(isInsideArena(3200, 3200)).toBe(false);   // city centre
    expect(isInsideArena(ARENA_X0 - 1, DRONE_PAD.y)).toBe(false);
    expect(isInsideArena(DRONE_PAD.x, ARENA_Y1 + 1)).toBe(false);
  });
});

describe('clampToArena', () => {
  it('leaves a position in the middle untouched', () => {
    const r = clampToArena(DRONE_PAD.x, DRONE_PAD.y);
    expect(r).toEqual({ x: DRONE_PAD.x, y: DRONE_PAD.y, hit: false });
  });

  it('pushes back on each of the four walls and reports the contact', () => {
    expect(clampToArena(0, DRONE_PAD.y)).toMatchObject({ x: DRONE_ARENA.minX, hit: true });
    expect(clampToArena(WORLD_SIZE, DRONE_PAD.y)).toMatchObject({ x: DRONE_ARENA.maxX, hit: true });
    expect(clampToArena(DRONE_PAD.x, 0)).toMatchObject({ y: DRONE_ARENA.minY, hit: true });
    expect(clampToArena(DRONE_PAD.x, WORLD_SIZE)).toMatchObject({ y: DRONE_ARENA.maxY, hit: true });
  });

  it('clamps both axes at once in a corner', () => {
    const r = clampToArena(-500, -500);
    expect(r).toEqual({ x: DRONE_ARENA.minX, y: DRONE_ARENA.minY, hit: true });
  });

  it('does not report contact for a position exactly on the wall', () => {
    expect(clampToArena(DRONE_ARENA.minX, DRONE_PAD.y).hit).toBe(false);
    expect(clampToArena(DRONE_ARENA.maxX, DRONE_PAD.y).hit).toBe(false);
  });
});

describe('droneConfinement', () => {
  it('confines free flight', () => {
    expect(droneConfinement(null)).toBe(DRONE_ARENA);
    expect(droneConfinement(undefined)).toBe(DRONE_ARENA);
  });

  it('lifts the walls for every live race phase, since the courses span the city', () => {
    for (const phase of ['countdown', 'racing', 'crashed', 'finished'] as RacePhase[]) {
      expect(droneConfinement(session(phase))).toBeNull();
    }
  });

  it('still confines an idle session', () => {
    expect(droneConfinement(session('idle'))).toBe(DRONE_ARENA);
  });
});
