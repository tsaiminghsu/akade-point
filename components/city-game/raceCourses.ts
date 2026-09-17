import type { RaceCourse, RaceGate } from './types';
import { TILE_SIZE, WORLD_CENTER_TILE } from './types';

const PI = Math.PI;

function gate(
  order: number,
  x: number, y: number, altitude: number, yaw: number,
  width: number, height: number,
  opts: Partial<Omit<RaceGate, 'id' | 'order' | 'x' | 'y' | 'altitude' | 'yaw' | 'width' | 'height'>> = {},
): RaceGate {
  return {
    id: `g${order}`,
    order,
    x, y, altitude, yaw,
    width, height,
    thickness: 0.25,
    shape: 'rectangle',
    glow: true,
    ...opts,
  };
}

/**
 * Gates are placed as tile offsets from the city centre. Every road offset is
 * a multiple of 8 (the block interval) so it lands on a road at any grid
 * size, and every plaza offset lies inside the Town Hall forecourt rectangle
 * (dx +2..+6, dy -6..-2). Positions use the tile corner (tile * TILE_SIZE),
 * matching the original hand-placed coordinates exactly.
 */
function gateAt(
  order: number,
  dgx: number, dgy: number, altitude: number, yaw: number,
  width: number, height: number,
  opts: Partial<Omit<RaceGate, 'id' | 'order' | 'x' | 'y' | 'altitude' | 'yaw' | 'width' | 'height'>> = {},
): RaceGate {
  const c = WORLD_CENTER_TILE;
  return gate(order, (c + dgx) * TILE_SIZE, (c + dgy) * TILE_SIZE, altitude, yaw, width, height, opts);
}

// ── Course 1: East Loop ────────────────────────────────────────────────────────
// Counter-clockwise rectangle in the eastern district: two road columns
// (+16 and +24 tiles) joined by two road rows (-24 and +8 tiles).
// All gates at road intersections, altitude 15. 10 gates, 2 laps.

const eastLoopGates: RaceGate[] = [
  gateAt(0,  16,   0, 15, 0,        6, 4, { isCheckpoint: true, isFinishGate: true, color: '#ffffff' }),
  gateAt(1,  16,  -8, 15, 0,        6, 4),  // N on the inner column
  gateAt(2,  16, -16, 15, 0,        6, 4),  // N
  gateAt(3,  16, -24, 15, 0,        6, 4),  // N — last, player turns E after
  gateAt(4,  24, -24, 15, PI / 2,   6, 4),  // E on the top row
  gateAt(5,  24, -16, 15, PI,       6, 4),  // S on the outer column
  gateAt(6,  24,  -8, 15, PI,       6, 4),  // S
  gateAt(7,  24,   0, 15, PI,       6, 4),  // S
  gateAt(8,  24,   8, 15, PI * 1.5, 6, 4),  // W on the bottom row
  gateAt(9,  16,   8, 15, PI * 1.5, 6, 4),  // W — last, player turns N to reach SF
];

export const EAST_LOOP: RaceCourse = {
  id: 'east_loop',
  name: 'East Loop',
  description: '城市東區低空環形賽道，貼地飛行穿越交叉路口',
  gates: eastLoopGates,
  totalLaps: 2,
  difficulty: 'easy',
  color: '#00e5ff',
  parTime: 70,
};

// ── Course 2: Civic Slalom ─────────────────────────────────────────────────────
// North-then-South slalom through the Town Hall plaza (dx +2..+6, dy -6..-2,
// never solid). Road endpoints on the centre row (dy 0) and the row above
// (dy -8). 8 gates, 2 laps.

const civicSlalomGates: RaceGate[] = [
  gateAt(0, 8,  0, 20, 0,  5, 3.5, { isCheckpoint: true, isFinishGate: true, color: '#ffffff' }),
  gateAt(1, 2, -2, 22, 0,  5, 3.5),  // jink L — plaza
  gateAt(2, 6, -4, 22, 0,  5, 3.5),  // jink R — plaza
  gateAt(3, 2, -6, 22, 0,  5, 3.5),  // jink L — plaza
  gateAt(4, 8, -8, 22, 0,  5, 3.5, { isCheckpoint: true, color: '#ff9100' }),  // U-turn end on a road intersection
  gateAt(5, 6, -6, 22, PI, 5, 3.5),  // S leg jink R
  gateAt(6, 2, -4, 22, PI, 5, 3.5),  // S leg jink L
  gateAt(7, 6, -2, 22, PI, 5, 3.5),  // S leg jink R — back to SF
];

export const CIVIC_SLALOM: RaceCourse = {
  id: 'civic_slalom',
  name: 'Civic Slalom',
  description: '市政廳廣場 Slalom — 北上南下穿梭廣場，U-turn 在廣場北端',
  gates: civicSlalomGates,
  totalLaps: 2,
  difficulty: 'medium',
  color: '#ff9100',
  parTime: 55,
};

// ── Course 3: High Rise Gauntlet ───────────────────────────────────────────────
// Dramatic vertical climb-and-dive on road columns (dx -8, 0, +8, +16) and
// rows (dy -32, -24, -16). Altitude 15 (street) to 100. 12 gates, 1 lap.

const highRiseGates: RaceGate[] = [
  gateAt(0,   0, -16,  15, 0,        8, 6, { isCheckpoint: true, isFinishGate: true, color: '#ffffff' }),
  gateAt(1,   0, -24,  55, 0,        7, 5),  // N, climbing
  gateAt(2,   0, -32, 100, 0,        6, 5),  // apex
  gateAt(3,   8, -32, 100, PI / 2,   6, 5, { isCheckpoint: true, color: '#e040fb' }),  // E turn at peak
  gateAt(4,   8, -24,  55, PI,       6, 5),  // S, descending
  gateAt(5,   8, -16,  15, PI,       7, 5),  // back to street
  gateAt(6,  16, -16,  15, PI / 2,   8, 5),  // E along the row
  gateAt(7,  16, -24,  55, 0,        7, 5),  // N, climbing
  gateAt(8,   8, -24,  90, PI * 1.5, 6, 5),  // W at altitude
  gateAt(9,   0, -24,  55, PI * 1.5, 7, 5),  // W, descending
  gateAt(10, -8, -24,  25, PI * 1.5, 7, 5),  // W to the outer column
  gateAt(11, -8, -16,  15, PI,       8, 5),  // S, back toward SF
];

export const HIGH_RISE_GAUNTLET: RaceCourse = {
  id: 'high_rise_gauntlet',
  name: 'High Rise Gauntlet',
  description: '極端垂直賽道 — 沿道路爬升俯衝，最高海拔 100',
  gates: highRiseGates,
  totalLaps: 1,
  difficulty: 'hard',
  color: '#e040fb',
  parTime: 80,
};

// ── Registry ───────────────────────────────────────────────────────────────────

export const ALL_COURSES: RaceCourse[] = [EAST_LOOP, CIVIC_SLALOM, HIGH_RISE_GAUNTLET];

export function getCourse(id: string): RaceCourse {
  return ALL_COURSES.find(c => c.id === id) ?? EAST_LOOP;
}
