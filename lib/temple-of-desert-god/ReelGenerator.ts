import type { Grid, Cell, GameConfig, DebugFlags, SymbolId } from './types';
import { GRID_COLS, GRID_ROWS } from './constants';
import { RandomEngine } from './RandomEngine';
import { WILD_ID, SCATTER_ID } from './types';

/**
 * Generates a 5×4 grid of symbols by picking stop positions on each reel strip.
 * Debug flags can force specific symbol types to appear.
 */
export function generateGrid(
  config: GameConfig,
  rng: RandomEngine,
  debugFlags?: DebugFlags
): Grid {
  const grid: Grid = Array.from({ length: GRID_COLS }, () =>
    Array.from({ length: GRID_ROWS }, () => null as unknown as Cell)
  );

  for (let reelIdx = 0; reelIdx < GRID_COLS; reelIdx++) {
    const stripConfig = config.reelStrips[reelIdx];
    const strip = stripConfig.strip as SymbolId[];
    const stop = rng.stripStop(strip.length);
    const symbols = rng.sliceStrip(strip, stop, GRID_ROWS);

    for (let rowIdx = 0; rowIdx < GRID_ROWS; rowIdx++) {
      grid[reelIdx][rowIdx] = {
        symbolId: symbols[rowIdx],
        reelIdx,
        rowIdx,
      };
    }
  }

  // Debug overrides
  if (debugFlags?.forceScatter) {
    injectScatters(grid, rng);
  }
  if (debugFlags?.forceWild) {
    injectWilds(grid, rng);
  }
  if (debugFlags?.forceBigWin) {
    injectBigWin(grid);
  }

  return grid;
}

function injectScatters(grid: Grid, rng: RandomEngine): void {
  // Place 4 scatters at random positions
  const positions: [number, number][] = [];
  for (let r = 0; r < GRID_COLS; r++) {
    for (let c = 0; c < GRID_ROWS; c++) {
      positions.push([r, c]);
    }
  }
  // Shuffle and pick 4
  for (let i = positions.length - 1; i > 0; i--) {
    const j = rng.range(0, i + 1);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  for (let i = 0; i < 4; i++) {
    const [r, c] = positions[i];
    grid[r][c] = { ...grid[r][c], symbolId: SCATTER_ID };
  }
}

function injectWilds(grid: Grid, rng: RandomEngine): void {
  // Place 2 wilds
  for (let i = 0; i < 2; i++) {
    const r = rng.range(0, GRID_COLS);
    const c = rng.range(0, GRID_ROWS);
    grid[r][c] = { ...grid[r][c], symbolId: WILD_ID };
  }
}

function injectBigWin(grid: Grid): void {
  // Place IDOL on all 5 reels row 0 → guaranteed 5-of-a-kind big win
  for (let r = 0; r < GRID_COLS; r++) {
    grid[r][0] = { ...grid[r][0], symbolId: 'IDOL' };
  }
}

/**
 * Generates new symbols to fill empty slots during cascade (top-down gravity).
 * Returns only the cells that need to be added (new from top).
 */
export function generateFillSymbols(
  reelIdx: number,
  count: number,
  config: GameConfig,
  rng: RandomEngine
): SymbolId[] {
  const strip = config.reelStrips[reelIdx].strip as SymbolId[];
  const stop = rng.stripStop(strip.length);
  return rng.sliceStrip(strip, stop, count);
}
