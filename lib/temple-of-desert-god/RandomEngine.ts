import type { SymbolId } from './types';

/**
 * Mulberry32 — fast 32-bit seeded PRNG.
 * Same results for same seed, useful for replay/debug.
 */
export class RandomEngine {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
  }

  private next(): number {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max) */
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** Random float in [0, 1) */
  float(): number {
    return this.next();
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[this.range(0, arr.length)];
  }

  /** Weighted pick — weights parallel to items, values are relative weight */
  weightedPick<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Pick a random stop index for a reel strip */
  stripStop(stripLength: number): number {
    return this.range(0, stripLength);
  }

  /** Pick 4 consecutive symbols from a strip starting at stop */
  sliceStrip(strip: SymbolId[], stop: number, count: number): SymbolId[] {
    const result: SymbolId[] = [];
    for (let i = 0; i < count; i++) {
      result.push(strip[(stop + i) % strip.length]);
    }
    return result;
  }
}
