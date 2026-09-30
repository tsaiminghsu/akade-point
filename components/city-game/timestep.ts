/**
 * Frame-rate independence for the AI.
 *
 * AI vehicles keep `speed` in px per 60 Hz frame — every tuned number
 * (`aiMax`, brake factors, the traffic separation nudge) was written against a
 * 60 Hz loop. The simulation now steps at whatever rate the display and the
 * fps cap allow (30, 60, 144 …), so each step converts its `dt` into "how many
 * 60 Hz frames' worth" and scales by that. At exactly 60 Hz nothing changes.
 */

/** The rate every px/frame number in the AI was tuned at. */
export const SIM_HZ = 60;

/** How many 60 Hz frames `dt` seconds covers. Multiply px/frame by this. */
export function frameScale(dt: number): number {
  return dt * SIM_HZ;
}

/**
 * A per-frame multiplier `k` (tuned at 60 Hz, e.g. `speed *= 0.85` to brake)
 * applied over `dt` seconds, so braking takes the same time at any rate.
 */
export function decay(k: number, dt: number): number {
  return Math.pow(k, dt * SIM_HZ);
}

/**
 * Fires once every `period` seconds of simulated time, whatever the step
 * size — the replacement for `tick % N === 0`, which ran twice as often per
 * second at 120 Hz as at 60 Hz.
 */
export class Cadence {
  private acc = 0;

  constructor(private readonly period: number) {}

  /** Advance by `dt` seconds; true on the step that crosses a period. */
  step(dt: number): boolean {
    this.acc += dt;
    // Tolerance: sixty steps of 1/60 must add up to one period, not 0.99999.
    if (this.acc + 1e-9 < this.period) return false;
    this.acc = Math.max(0, this.acc - this.period);
    // Never owe more than one extra firing after a long hitch.
    if (this.acc >= this.period) this.acc = 0;
    return true;
  }
}
