/**
 * Pause-aware replacement for `performance.now()`.
 *
 * The simulation reads time from here so that pausing actually stops it.
 * Race lap times are derived from wall-clock deltas (`race.ts`), and mission
 * cooldowns / notification expiry compare a stored stamp against the frame's
 * `nowMs`, so a clock that kept running while paused would inflate lap times
 * and expire notifications the player never saw.
 *
 * Real-world timestamps (save `savedAt`, transaction log entries, id
 * generation) deliberately keep using `Date.now()` / `performance.now()`.
 */

let offset = 0;
let pausedAt: number | null = null;

/** Milliseconds since page load, excluding time spent paused. */
export function now(): number {
  return (pausedAt ?? performance.now()) - offset;
}

export function pause(): void {
  if (pausedAt === null) pausedAt = performance.now();
}

export function resume(): void {
  if (pausedAt === null) return;
  offset += performance.now() - pausedAt;
  pausedAt = null;
}

export function isPaused(): boolean {
  return pausedAt !== null;
}

/** Test hook: drop all accumulated pause time. */
export function resetClock(): void {
  offset = 0;
  pausedAt = null;
}
