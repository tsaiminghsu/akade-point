import type { Grid, Cell, PaylineWin, GameConfig } from './types';
import { GRID_COLS, GRID_ROWS } from './constants';
import { generateFillSymbols } from './ReelGenerator';
import { RandomEngine } from './RandomEngine';

/** Mark all cells that are part of winning paylines for removal */
export function markWinners(grid: Grid, wins: PaylineWin[]): Grid {
  const newGrid = deepCopyGrid(grid);

  for (const win of wins) {
    for (const cell of win.cells) {
      newGrid[cell.reelIdx][cell.rowIdx] = {
        ...newGrid[cell.reelIdx][cell.rowIdx],
        markedForRemoval: true,
      };
    }
  }

  return newGrid;
}

/**
 * Remove marked cells, shift surviving symbols down (gravity),
 * fill empty slots from the top with new symbols.
 */
export function applyGravity(
  grid: Grid,
  config: GameConfig,
  rng: RandomEngine,
  stickyWilds?: Cell[]
): Grid {
  const newGrid: Grid = Array.from({ length: GRID_COLS }, () =>
    Array(GRID_ROWS).fill(null) as Cell[]
  );

  for (let reelIdx = 0; reelIdx < GRID_COLS; reelIdx++) {
    // Collect surviving cells (bottom to top)
    const surviving: Cell[] = [];
    for (let rowIdx = GRID_ROWS - 1; rowIdx >= 0; rowIdx--) {
      const cell = grid[reelIdx][rowIdx];
      if (!cell?.markedForRemoval) {
        surviving.push({ ...cell, markedForRemoval: false });
      }
    }

    const emptyCount = GRID_ROWS - surviving.length;
    const fillSymbols = generateFillSymbols(reelIdx, emptyCount, config, rng);

    // Rebuild column: new symbols at top, survivors below
    for (let rowIdx = 0; rowIdx < emptyCount; rowIdx++) {
      newGrid[reelIdx][rowIdx] = {
        symbolId: fillSymbols[rowIdx],
        reelIdx,
        rowIdx,
      };
    }
    for (let i = 0; i < surviving.length; i++) {
      const rowIdx = emptyCount + i;
      newGrid[reelIdx][rowIdx] = { ...surviving[surviving.length - 1 - i], rowIdx };
    }
  }

  // Re-inject sticky wilds (god power)
  if (stickyWilds) {
    for (const sw of stickyWilds) {
      if (sw.reelIdx < GRID_COLS && sw.rowIdx < GRID_ROWS) {
        newGrid[sw.reelIdx][sw.rowIdx] = {
          ...newGrid[sw.reelIdx][sw.rowIdx],
          symbolId: 'GOLDEN_SUN',
          wildMultiplier: sw.wildMultiplier,
          isSticky: true,
        };
      }
    }
  }

  return newGrid;
}

function deepCopyGrid(grid: Grid): Grid {
  return grid.map(reel => reel.map(cell => ({ ...cell })));
}
