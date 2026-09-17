import { describe, it, expect } from 'vitest';
import { ALL_COURSES, getCourse } from '../raceCourses';
import { generateWorld, isSolidAtAltitude, getTileAt } from '../worldGen';
import { TileType, WORLD_SIZE, WorldData } from '../types';

const world: WorldData = generateWorld(42);

const OPEN_LOW: ReadonlySet<TileType> = new Set([
  TileType.ROAD_H, TileType.ROAD_V, TileType.INTERSECTION,
  TileType.SIDEWALK, TileType.TOWN_HALL_PLAZA,
]);

/** Sample points across a gate's opening at its altitude. */
function gateSamples(gx: number, gy: number, yaw: number, width: number) {
  // Gate right vector (perpendicular to travel), in world px (10 px per 3D unit).
  const rx = Math.cos(yaw);
  const ry = Math.sin(yaw);
  const half = (width / 2) * 10;
  const out: { x: number; y: number }[] = [];
  for (const t of [-1, -0.5, 0, 0.5, 1]) {
    out.push({ x: gx + rx * half * t, y: gy + ry * half * t });
  }
  return out;
}

describe('race courses', () => {
  it('registers the three known courses under stable ids', () => {
    expect(ALL_COURSES.map(c => c.id)).toEqual(['east_loop', 'civic_slalom', 'high_rise_gauntlet']);
    expect(getCourse('civic_slalom').id).toBe('civic_slalom');
    expect(getCourse('nope').id).toBe('east_loop');
  });

  it('keeps every gate inside the world', () => {
    for (const course of ALL_COURSES) {
      for (const g of course.gates) {
        expect(g.x).toBeGreaterThan(0);
        expect(g.y).toBeGreaterThan(0);
        expect(g.x).toBeLessThan(WORLD_SIZE);
        expect(g.y).toBeLessThan(WORLD_SIZE);
      }
    }
  });

  it('never puts a gate opening inside geometry at its altitude', () => {
    for (const course of ALL_COURSES) {
      for (const g of course.gates) {
        for (const p of gateSamples(g.x, g.y, g.yaw, g.width)) {
          expect(
            isSolidAtAltitude(world.grid, p.x, p.y, g.altitude),
            `${course.id} gate ${g.order} blocked at (${p.x},${p.y}) alt ${g.altitude}`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps low gates over roads or the plaza', () => {
    for (const course of ALL_COURSES) {
      for (const g of course.gates) {
        if (g.altitude > 25) continue;
        // Gates sit on tile corners; check the tile the corner opens onto.
        const t = getTileAt(world.grid, g.x + 1, g.y + 1)!;
        expect(OPEN_LOW.has(t.type), `${course.id} gate ${g.order} on ${t.type}`).toBe(true);
      }
    }
  });

  it('respawns the drone in open air before each gate', () => {
    const APPROACH = 100;
    for (const course of ALL_COURSES) {
      for (const g of course.gates) {
        const nx = Math.sin(g.yaw);
        const nz = -Math.cos(g.yaw);
        const rx = g.x - nx * APPROACH;
        const ry = g.y - nz * APPROACH;
        expect(rx).toBeGreaterThan(0);
        expect(ry).toBeGreaterThan(0);
        expect(
          isSolidAtAltitude(world.grid, rx, ry, g.altitude),
          `${course.id} gate ${g.order} respawn blocked`,
        ).toBe(false);
      }
    }
  });

  it('orders gates contiguously with one finish gate each', () => {
    for (const course of ALL_COURSES) {
      course.gates.forEach((g, i) => expect(g.order).toBe(i));
      expect(course.gates.filter(g => g.isFinishGate)).toHaveLength(1);
    }
  });
});
