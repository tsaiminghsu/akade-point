import { describe, it, expect } from 'vitest';
import { stepBody, blockIntersectsBody } from './physics';
import type { PlayerBody, SolidSource } from './physics';

const OPTS = { halfWidth: 0.3, height: 1.8 };

/** Flat solid floor below y=10. */
const floorWorld: SolidSource = { isSolid: (_x, y) => y < 10 };

function makeBody(x = 0.5, y = 15, z = 0.5): PlayerBody {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: false };
}

describe('stepBody', () => {
  it('falls under gravity and lands on the floor', () => {
    const body = makeBody();
    body.vel.y = -5;
    for (let i = 0; i < 120; i++) {
      body.vel.y -= 25 * (1 / 60); // gravity
      stepBody(floorWorld, body, 1 / 60, OPTS);
    }
    expect(body.onGround).toBe(true);
    expect(body.vel.y).toBe(0);
    // Feet rest exactly on top of the floor (within EPS).
    expect(body.pos.y).toBeCloseTo(10, 2);
  });

  it('stops horizontal movement at a wall', () => {
    // Solid plane at x >= 5.
    const wall: SolidSource = { isSolid: (x) => x >= 5 };
    const body = makeBody(4.0, 30, 0.5);
    body.vel.x = 6;
    for (let i = 0; i < 60; i++) stepBody(wall, body, 1 / 60, OPTS);
    expect(body.pos.x + OPTS.halfWidth).toBeLessThanOrEqual(5 + 0.001);
    expect(body.pos.x + OPTS.halfWidth).toBeGreaterThan(4.9);
    expect(body.vel.x).toBe(0);
  });

  it('ceiling stops upward movement without landing', () => {
    // Solid ceiling above y=32.
    const ceiling: SolidSource = { isSolid: (_x, y) => y >= 32 };
    const body = makeBody(0.5, 29.5, 0.5);
    body.vel.y = 10;
    for (let i = 0; i < 10; i++) stepBody(ceiling, body, 1 / 30, OPTS);
    expect(body.onGround).toBe(false);
    expect(body.vel.y).toBe(0);
    expect(body.pos.y + OPTS.height).toBeLessThanOrEqual(32 + 0.001);
  });

  it('free fall with no obstacles keeps velocity', () => {
    const air: SolidSource = { isSolid: () => false };
    const body = makeBody();
    body.vel.y = -3;
    stepBody(air, body, 1 / 60, OPTS);
    expect(body.onGround).toBe(false);
    expect(body.vel.y).toBe(-3);
  });
});

describe('blockIntersectsBody', () => {
  it('detects overlap and non-overlap', () => {
    const pos = { x: 5.5, y: 10, z: 5.5 };
    // Block at feet level overlaps.
    expect(blockIntersectsBody(5, 10, 5, pos, OPTS)).toBe(true);
    // Block at head height.
    expect(blockIntersectsBody(5, 11, 5, pos, OPTS)).toBe(true);
    // The floor directly beneath is touching, not overlapping.
    expect(blockIntersectsBody(5, 9, 5, pos, OPTS)).toBe(false);
    // Two blocks below.
    expect(blockIntersectsBody(5, 7, 5, pos, OPTS)).toBe(false);
    // Off to the side.
    expect(blockIntersectsBody(8, 10, 5, pos, OPTS)).toBe(false);
  });
});
