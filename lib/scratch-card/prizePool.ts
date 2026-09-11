import type { PrizeDefinition, PrizePoolConfig, PrizePoolState } from './config'

export function initializePrizePool(config: PrizePoolConfig): PrizePoolState {
  const inventory = new Map<number, { total: number; remaining: number }>()

  if (config.mode === 'finite' && config.inventory) {
    for (const item of config.inventory) {
      inventory.set(item.amount, { total: item.total, remaining: item.remaining })
    }
  }

  return { mode: config.mode, inventory }
}

export function isPrizeAvailable(state: PrizePoolState, prizeAmount: number): boolean {
  if (state.mode === 'infinite') return true
  const entry = state.inventory.get(prizeAmount)
  return entry != null && entry.remaining > 0
}

// Returns indices into the prizes array that are still available.
export function getAvailablePrizeIndices(
  state: PrizePoolState,
  prizes: PrizeDefinition[],
): number[] {
  if (state.mode === 'infinite') return prizes.map((_, i) => i)
  return prizes.reduce<number[]>((acc, p, i) => {
    if (isPrizeAvailable(state, p.amount)) acc.push(i)
    return acc
  }, [])
}

// Returns new state with decremented remaining (immutable).
export function consumePrize(state: PrizePoolState, prizeAmount: number): PrizePoolState {
  if (state.mode === 'infinite') return state

  const entry = state.inventory.get(prizeAmount)
  if (!entry || entry.remaining <= 0) return state

  const newInventory = new Map(state.inventory)
  newInventory.set(prizeAmount, { ...entry, remaining: entry.remaining - 1 })
  return { ...state, inventory: newInventory }
}

export interface PrizePoolSummaryItem {
  amount: number
  total: number | 'unlimited'
  remaining: number | 'unlimited'
  pct: number // fraction remaining (0–1); 1.0 for infinite
}

export function getPrizePoolSummary(
  state: PrizePoolState,
  prizes: PrizeDefinition[],
): PrizePoolSummaryItem[] {
  return prizes.map(p => {
    if (state.mode === 'infinite') {
      return { amount: p.amount, total: 'unlimited', remaining: 'unlimited', pct: 1 }
    }
    const entry = state.inventory.get(p.amount)
    if (!entry) return { amount: p.amount, total: 0, remaining: 0, pct: 0 }
    return {
      amount: p.amount,
      total: entry.total,
      remaining: entry.remaining,
      pct: entry.total > 0 ? entry.remaining / entry.total : 0,
    }
  })
}
