import type { RaceCourse, RaceGate } from './types';

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

// All gate positions are at road tile coordinates so they are never on BUILDING tiles.
// Road columns (ROAD_V at all y): x = 1280, 1600, 1920, 2240, 2560
// Road rows  (ROAD_H at all x):   y = 320, 640, 960, 1280, 1600, 1920
// Town Hall plaza (TOWN_HALL_PLAZA, not solid): x=1680–1840, y=1360–1520

// ── Course 1: East Loop ────────────────────────────────────────────────────────
// Counter-clockwise rectangle in the eastern district.
// N on x=2240 → E on y=640 → S on x=2560 → W on y=1920 → N back.
// All gates at road intersections, altitude 15. 10 gates, 2 laps.

const eastLoopGates: RaceGate[] = [
  gate(0,  2240, 1600, 15, 0,         6, 4, { isCheckpoint: true, isFinishGate: true, color: '#ffffff' }),
  gate(1,  2240, 1280, 15, 0,         6, 4),  // N on x=2240
  gate(2,  2240,  960, 15, 0,         6, 4),  // N
  gate(3,  2240,  640, 15, 0,         6, 4),  // N — last, player turns E after
  gate(4,  2560,  640, 15, PI / 2,    6, 4),  // E on y=640, drone crosses x=2560 going E
  gate(5,  2560,  960, 15, PI,        6, 4),  // S on x=2560
  gate(6,  2560, 1280, 15, PI,        6, 4),  // S
  gate(7,  2560, 1600, 15, PI,        6, 4),  // S
  gate(8,  2560, 1920, 15, PI * 1.5,  6, 4),  // W on y=1920, drone crosses x=2560 going W
  gate(9,  2240, 1920, 15, PI * 1.5,  6, 4),  // W — last, player turns N to reach SF
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
// North-then-South slalom through the Town Hall plaza.
// TOWN_HALL_PLAZA tiles (1680–1840, 1360–1520) are guaranteed non-solid.
// Road endpoints at y=1280 and y=1600 (road rows).
// 8 gates, 2 laps.
//
// North leg: enter from y=1600, fly N (decreasing y) through plaza to y=1280, U-turn.
// South leg: fly S (increasing y) back through plaza to y=1600.

// SF at a road intersection (1920, 1600) — x=1920 road col, y=1600 road row.
// Respawn position = 100px south = (1920, 1700) — x=1920 is ROAD_V at all y → safe.
const civicSlalomGates: RaceGate[] = [
  gate(0, 1920, 1600, 20, 0,     5, 3.5, { isCheckpoint: true, isFinishGate: true, color: '#ffffff' }),
  gate(1, 1680, 1520, 22, 0,     5, 3.5),  // jink L — plaza tile (gx=42, gy=38)
  gate(2, 1840, 1440, 22, 0,     5, 3.5),  // jink R — plaza tile (gx=46, gy=36)
  gate(3, 1680, 1360, 22, 0,     5, 3.5),  // jink L — plaza tile (gx=42, gy=34)
  gate(4, 1920, 1280, 22, 0,     5, 3.5, { isCheckpoint: true, color: '#ff9100' }),  // x=1920 road col, y=1280 road row — U-turn end
  gate(5, 1840, 1360, 22, PI,    5, 3.5),  // S leg jink R
  gate(6, 1680, 1440, 22, PI,    5, 3.5),  // S leg jink L
  gate(7, 1840, 1520, 22, PI,    5, 3.5),  // S leg jink R — back to SF
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
// Dramatic vertical climb-and-dive on road columns.
// All gates on road intersections (x=1280/1600/1920/2240, y=320/640/960/1280).
// Altitude ranges from 15 (street) to 100 (high). 12 gates, 1 lap.
//
// Route: climb N on x=1600 → turn E at peak on y=320 → descend S on x=1920
//        → street E on y=960 → N on x=2240 → W at altitude on y=640
//        → descend W on y=640 → S at x=1280 → back to SF.

const highRiseGates: RaceGate[] = [
  gate(0,  1600,  960, 15, 0,         8, 6, { isCheckpoint: true, isFinishGate: true, color: '#ffffff' }),
  gate(1,  1600,  640, 55, 0,         7, 5),  // N, climbing on x=1600
  gate(2,  1600,  320, 100, 0,        6, 5),  // apex — x=1600 road col, y=320 road row
  gate(3,  1920,  320, 100, PI / 2,   6, 5, { isCheckpoint: true, color: '#e040fb' }),  // E turn at peak
  gate(4,  1920,  640,  55, PI,       6, 5),  // S, descending on x=1920
  gate(5,  1920,  960,  15, PI,       7, 5),  // back to street on x=1920
  gate(6,  2240,  960,  15, PI / 2,   8, 5),  // E on y=960 road row
  gate(7,  2240,  640,  55, 0,        7, 5),  // N, climbing on x=2240
  gate(8,  1920,  640,  90, PI * 1.5, 6, 5),  // W at altitude on y=640 road row
  gate(9,  1600,  640,  55, PI * 1.5, 7, 5),  // W, descending on y=640
  gate(10, 1280,  640,  25, PI * 1.5, 7, 5),  // W to x=1280 road col
  gate(11, 1280,  960,  15, PI,       8, 5),  // S on x=1280, back toward SF
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
