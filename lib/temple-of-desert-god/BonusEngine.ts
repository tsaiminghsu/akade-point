import type { WinEvaluation, GodPowerType, Grid, Cell, GameConfig } from './types';
import { WILD_ID } from './types';
import { GRID_COLS, GRID_ROWS, GOD_POWERS } from './constants';
import { RandomEngine } from './RandomEngine';

/** Check if free spins are triggered from a win evaluation */
export function checkFreeSpinTrigger(
  evaluation: WinEvaluation
): { triggered: boolean; count: number } {
  if (!evaluation.triggeredFreeSpins) return { triggered: false, count: 0 };
  return { triggered: true, count: evaluation.freeSpinCount };
}

/** Randomly select a God Power based on configured weights */
export function selectGodPower(config: GameConfig, rng: RandomEngine): GodPowerType {
  const types = GOD_POWERS.map(g => g.type);
  const weights = types.map(t => config.godPowerWeights[t] ?? 0);
  return rng.weightedPick(types, weights);
}

/**
 * Apply God Power effects to the grid.
 * - EXPANDING_WILD: expands any wild to fill entire reel
 * - Other powers are handled during spin evaluation
 */
export function applyGodPowerToGrid(
  grid: Grid,
  godPower: GodPowerType,
  stickyWilds: Cell[]
): Grid {
  if (godPower !== 'EXPANDING_WILD') return grid;

  const newGrid = grid.map(reel => reel.map(cell => ({ ...cell })));

  for (let reelIdx = 0; reelIdx < GRID_COLS; reelIdx++) {
    const hasWild = newGrid[reelIdx].some(cell => cell.symbolId === WILD_ID);
    if (hasWild) {
      for (let rowIdx = 0; rowIdx < GRID_ROWS; rowIdx++) {
        newGrid[reelIdx][rowIdx] = {
          ...newGrid[reelIdx][rowIdx],
          symbolId: 'GOLDEN_SUN',
          isExpanded: true,
        };
      }
    }
  }

  return newGrid;
}

/** Collect all sticky wilds from the grid */
export function collectStickyWilds(grid: Grid): Cell[] {
  const stickies: Cell[] = [];
  for (let r = 0; r < GRID_COLS; r++) {
    for (let c = 0; c < GRID_ROWS; c++) {
      if (grid[r][c]?.symbolId === WILD_ID) {
        stickies.push({ ...grid[r][c], isSticky: true });
      }
    }
  }
  return stickies;
}
