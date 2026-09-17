/**
 * Player economy.
 *
 * Deliberately framework-free and side-effect-free so it can be unit tested and
 * serialised straight into the save file. The HUD reads `drainTicks` to animate
 * the floating +$ / -$ figures.
 */

import * as gameClock from './gameClock';

export const START_CASH = 500;

/** Fixed prices, in dollars. */
export const PRICES = {
  phone_taxi: 50,
  phone_heli: 300,
  busted: 100,
  paynspray: 100,
  hospital: 150,
} as const;

export type PriceKey = keyof typeof PRICES;

/** Food menu lives here so the engine can charge for an order. */
export const FOOD_MENU: Array<{ name: string; price: number; emoji: string }> = [
  { name: '牛肉麵', price: 180, emoji: '🍜' },
  { name: '披薩', price: 250, emoji: '🍕' },
  { name: '壽司', price: 350, emoji: '🍣' },
];

export interface Transaction {
  id: string;
  /** Positive for income, negative for spending. */
  amount: number;
  reason: string;
  at: number;
}

/** One floating figure on the HUD. */
export interface CashTick {
  id: string;
  amount: number;
  at: number;
}

const LOG_LIMIT = 20;
/** Ticks older than this are dropped; the CSS animation is shorter than it. */
const TICK_TTL_MS = 2500;

let seq = 0;
function nextId(): string {
  seq += 1;
  return `tx${seq}`;
}

export interface EconomyJSON {
  cash: number;
  log: Transaction[];
}

export class Economy {
  cash: number;
  log: Transaction[] = [];

  private ticks: CashTick[] = [];

  constructor(cash: number = START_CASH, log: Transaction[] = []) {
    this.cash = cash;
    this.log = log.slice(-LOG_LIMIT);
  }

  canAfford(amount: number): boolean {
    return this.cash >= amount;
  }

  earn(amount: number, reason: string): void {
    if (amount <= 0) return;
    this.cash += amount;
    this.record(amount, reason);
  }

  /**
   * Spend money.
   *
   * By default the charge is all-or-nothing, which is what phone services want.
   * Penalties (`busted`, `paynspray`, `hospital`) pass `allowPartial` so a broke
   * player still loses what they have instead of going into debt.
   */
  charge(
    price: PriceKey | number,
    reason?: string,
    opts: { allowPartial?: boolean } = {},
  ): boolean {
    const amount = typeof price === 'number' ? price : PRICES[price];
    const label = reason ?? (typeof price === 'string' ? price : 'spend');
    if (amount <= 0) return true;

    if (this.cash < amount) {
      if (!opts.allowPartial) return false;
      const taken = this.cash;
      if (taken > 0) {
        this.cash = 0;
        this.record(-taken, label);
      }
      return true;
    }

    this.cash -= amount;
    this.record(-amount, label);
    return true;
  }

  private record(amount: number, reason: string): void {
    const entry: Transaction = { id: nextId(), amount, reason, at: Date.now() };
    this.log.push(entry);
    if (this.log.length > LOG_LIMIT) this.log.shift();
    this.ticks.push({ id: entry.id, amount, at: gameClock.now() });
  }

  /** Read the pending HUD figures, dropping any that have expired. */
  drainTicks(nowMs: number): CashTick[] {
    if (this.ticks.length === 0) return this.ticks;
    this.ticks = this.ticks.filter(t => nowMs - t.at < TICK_TTL_MS);
    return this.ticks;
  }

  reset(cash: number = START_CASH): void {
    this.cash = cash;
    this.log = [];
    this.ticks = [];
  }

  toJSON(): EconomyJSON {
    return { cash: this.cash, log: this.log };
  }

  static fromJSON(data: Partial<EconomyJSON> | undefined): Economy {
    const cash = typeof data?.cash === 'number' && Number.isFinite(data.cash)
      ? data.cash
      : START_CASH;
    const log = Array.isArray(data?.log) ? data!.log! : [];
    return new Economy(Math.max(0, cash), log);
  }
}
