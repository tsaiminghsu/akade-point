/**
 * Which link the ground station listens to and commands through, and when its
 * data counts as stale. Pure so the rules are testable.
 */

export type LinkKind = "direct" | "cloud";

export interface LinkHealth {
  /** configured / attempted at all */
  enabled: boolean;
  /** receive time (browser clock, ms) of the last good message */
  lastRxAt: number | null;
}

/** Freshness limits: the direct link pushes at 10 Hz, the cloud at ~1 Hz over 4G. */
export const STALE_ENTER_MS: Record<LinkKind, number> = { direct: 1500, cloud: 5000 };
export const STALE_EXIT_MS: Record<LinkKind, number> = { direct: 800, cloud: 3000 };

/**
 * Prefer the direct link while it is fresh; fall back to the cloud; "none"
 * when neither has delivered recently.
 */
export function pickLink(direct: LinkHealth, cloud: LinkHealth, now: number): LinkKind | "none" {
  const fresh = (h: LinkHealth, kind: LinkKind) => h.enabled && h.lastRxAt !== null && now - h.lastRxAt < STALE_ENTER_MS[kind];
  if (fresh(direct, "direct")) return "direct";
  if (fresh(cloud, "cloud")) return "cloud";
  return "none";
}

/**
 * Stale detection with hysteresis: data turns stale after `enterMs` without a
 * message and only turns fresh again once messages arrive within `exitMs` of
 * each other. A 4G link that stutters around the threshold would otherwise
 * flash LINK LOST on and off.
 */
export class Staleness {
  private stale = true;
  private prevRx: number | null = null;

  constructor(private enterMs: number, private exitMs: number) {}

  /** Call on every received message. */
  onMessage(rxAt: number): void {
    if (this.stale && this.prevRx !== null && rxAt - this.prevRx <= this.exitMs) this.stale = false;
    if (this.stale && this.prevRx === null) {
      // First message ever: trust it until proven otherwise.
      this.stale = false;
    }
    this.prevRx = rxAt;
  }

  /** Call periodically (and before reading). */
  isStale(now: number): boolean {
    if (this.prevRx === null || now - this.prevRx >= this.enterMs) this.stale = true;
    return this.stale;
  }

  reset(): void {
    this.stale = true;
    this.prevRx = null;
  }
}
