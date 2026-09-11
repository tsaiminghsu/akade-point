import type { AntiStreakConfig, StreakState } from './config'

// prizeCount: number of enabled prizes (not counting no-win)
// The last slot (index = prizeCount) tracks no-win streaks.
export function initStreakState(prizeCount: number): StreakState {
  const size = prizeCount + 1
  return {
    streakCounts: new Array(size).fill(0),
    penaltyFactors: new Array(size).fill(1.0),
  }
}

// drawnPrizeIndex: index into enabled prizes array, or -1 for no-win
export function updateStreak(
  state: StreakState,
  drawnPrizeIndex: number,
  config: AntiStreakConfig,
): StreakState {
  const size = state.streakCounts.length
  const noWinSlot = size - 1
  const hitSlot = drawnPrizeIndex === -1 ? noWinSlot : drawnPrizeIndex

  const streakCounts = [...state.streakCounts]
  const penaltyFactors = [...state.penaltyFactors]

  for (let i = 0; i < size; i++) {
    if (i === hitSlot) {
      streakCounts[i] += 1
      if (streakCounts[i] >= config.maxSameStreak) {
        penaltyFactors[i] = config.penaltyFactor
      }
    } else {
      streakCounts[i] = 0
      // recover penalty toward 1.0
      if (penaltyFactors[i] < 1.0) {
        penaltyFactors[i] = Math.min(1.0, penaltyFactors[i] + config.recoveryRate)
      }
    }
  }

  return { streakCounts, penaltyFactors }
}

// Apply streak penalties to prize weights (does NOT include noWin slot).
// Returns new array; does not mutate input.
export function applyStreakPenalties(
  weights: number[],
  streakState: StreakState,
): number[] {
  return weights.map((w, i) => w * streakState.penaltyFactors[i])
}
