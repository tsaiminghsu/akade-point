import type { Grid, GameConfig, WinEvaluation, PaylineWin, Cell, SymbolId } from './types';
import { WILD_ID, SCATTER_ID } from './types';
import { PAYLINES, GRID_COLS } from './constants';

/**
 * Evaluates a grid against all 40 paylines and counts scatter symbols.
 * Wilds substitute for any non-scatter symbol.
 * Scatters pay anywhere (not on paylines).
 */
export function evaluateGrid(
  grid: Grid,
  config: GameConfig,
  cascadeLevel = 0,
  isFreeGame = false
): WinEvaluation {
  const paylineWins: PaylineWin[] = [];

  for (const payline of PAYLINES) {
    const win = checkPayline(grid, payline.rows, payline.id, config);
    if (win) paylineWins.push(win);
  }

  // Count scatters anywhere on grid
  const scatterPositions: Cell[] = [];
  for (let r = 0; r < GRID_COLS; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]?.symbolId === SCATTER_ID) {
        scatterPositions.push(grid[r][c]);
      }
    }
  }
  const scatterCount = scatterPositions.length;

  // Scatter pays
  let scatterWin = 0;
  if (scatterCount >= 4) {
    const scatterPayouts = config.scatterPayouts as Record<string, number>;
    const key = Math.min(scatterCount, 6).toString();
    scatterWin = (scatterPayouts[key] ?? 0) * config.betLevels[config.defaultBetLevel];
  }

  const totalWin = paylineWins.reduce((s, w) => s + w.finalPayout, 0) + scatterWin;

  const triggeredFreeSpins = !isFreeGame && scatterCount >= 4;
  const freeSpinCounts = config.freeSpinCounts as Record<string, number>;
  const freeSpinCount = triggeredFreeSpins
    ? (freeSpinCounts[Math.min(scatterCount, 6).toString()] ?? 0)
    : 0;

  return {
    paylineWins,
    scatterCount,
    scatterPositions,
    totalWin,
    triggeredFreeSpins,
    freeSpinCount,
    cascadeLevel,
  };
}

function checkPayline(
  grid: Grid,
  rows: readonly number[],
  paylineId: number,
  config: GameConfig
): PaylineWin | null {
  // Collect 5 cells along the payline
  const cells: Cell[] = [];
  for (let reelIdx = 0; reelIdx < GRID_COLS; reelIdx++) {
    const rowIdx = rows[reelIdx];
    cells.push(grid[reelIdx][rowIdx]);
  }

  // Find the base symbol (first non-wild, non-scatter from left)
  let baseSymbol: SymbolId | null = null;
  for (const cell of cells) {
    if (cell.symbolId !== WILD_ID && cell.symbolId !== SCATTER_ID) {
      baseSymbol = cell.symbolId;
      break;
    }
  }

  // All wilds — treat as IDOL win (highest symbol)
  if (baseSymbol === null) {
    baseSymbol = 'IDOL' as SymbolId;
  }

  // Count consecutive matches from left (wilds count as match)
  let count = 0;
  const winCells: Cell[] = [];
  for (const cell of cells) {
    if (cell.symbolId === WILD_ID || cell.symbolId === baseSymbol) {
      count++;
      winCells.push(cell);
    } else {
      break;
    }
  }

  if (count < 3) return null;

  // Skip payline if all cells are scatters (scatter pays separately)
  if (baseSymbol === SCATTER_ID) return null;

  const paytableEntry = config.paytable.find(p => p.symbolId === baseSymbol);
  if (!paytableEntry) return null;

  const payouts = paytableEntry.payouts as Record<string, number>;
  const basePayout = payouts[count.toString()] ?? 0;
  if (basePayout === 0) return null;

  // Wild multiplier is handled by MultiplierEngine; default 1 here
  const betPerLine = config.betLevels[config.defaultBetLevel] / config.paylines;

  return {
    paylineId,
    symbolId: baseSymbol,
    count,
    cells: winCells,
    basePayout,
    wildMultiplier: 1,
    finalPayout: basePayout * betPerLine,
  };
}
