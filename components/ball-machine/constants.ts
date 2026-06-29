// Shared physics/geometry constants — no component imports allowed here.
// Import from this file instead of BallMachineGame to avoid circular deps.
export const HOLE_SPACING = 1.1;
export const BALL_R       = 0.42;
export const CONTAINER_H  = 3.2;
export const FLOOR_T      = 0.18;
export const WALL_T       = 0.07;
export const GRID_COLS    = 5;
export const GRID_ROWS    = 5;
export const MAX_HOLES    = GRID_COLS * GRID_ROWS;
