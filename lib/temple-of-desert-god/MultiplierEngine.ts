import type { PaylineWin, WinEvaluation, GameConfig, GodPowerType } from './types';
import { WILD_ID } from './types';
import { RandomEngine } from './RandomEngine';

/**
 * Calculates wild multipliers for payline wins.
 * During free games each Wild on a payline has a random multiplier (2/3/5/10).
 * Multiple Wilds on the same payline multiply together.
 * God Power RANDOM_MULTIPLIER adds an extra multiplier on top of every win.
 */
export function applyMultipliers(
  evaluation: WinEvaluation,
  config: GameConfig,
  rng: RandomEngine,
  isFreeGame: boolean,
  godPower: GodPowerType | null,
  betPerLine: number
): WinEvaluation {
  if (!isFreeGame) return evaluation;

  const multiplierValues = [2, 3, 5, 10] as const;
  const multiplierWeights = config.wildMultiplierWeights;
  const weights = multiplierValues.map(v => multiplierWeights[v]);

  const updatedWins = evaluation.paylineWins.map(win => {
    const wilds = win.cells.filter(c => c.symbolId === WILD_ID);
    if (wilds.length === 0 && godPower !== 'RANDOM_MULTIPLIER') return win;

    // Product of wild multipliers on this payline
    let wildMult = 1;
    for (const wild of wilds) {
      const m = wild.wildMultiplier ?? rng.weightedPick(multiplierValues as unknown as number[], weights) as 2 | 3 | 5 | 10;
      wild.wildMultiplier = m;
      wildMult *= m;
    }

    // God Power: RANDOM_MULTIPLIER adds extra 2-10x
    let godMult = 1;
    if (godPower === 'RANDOM_MULTIPLIER') {
      godMult = rng.range(2, 11);
    }

    const totalMult = wildMult * godMult;
    const finalPayout = win.basePayout * betPerLine * totalMult;

    return { ...win, wildMultiplier: totalMult, finalPayout };
  });

  const totalWin = updatedWins.reduce((s, w) => s + w.finalPayout, 0)
    + evaluation.totalWin - evaluation.paylineWins.reduce((s, w) => s + w.finalPayout, 0);

  return { ...evaluation, paylineWins: updatedWins, totalWin };
}

/** Assign wild multipliers to Wild cells in the grid for display purposes */
export function assignWildMultipliers(
  win: PaylineWin,
  config: GameConfig,
  rng: RandomEngine
): PaylineWin {
  const multiplierValues = [2, 3, 5, 10] as const;
  const weights = multiplierValues.map(v => config.wildMultiplierWeights[v]);

  const cells = win.cells.map(cell => {
    if (cell.symbolId !== WILD_ID) return cell;
    if (cell.wildMultiplier) return cell;
    const m = rng.weightedPick(
      multiplierValues as unknown as number[],
      weights
    ) as 2 | 3 | 5 | 10;
    return { ...cell, wildMultiplier: m };
  });

  return { ...win, cells };
}
