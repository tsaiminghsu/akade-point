/**
 * GTA-style wanted level.
 *
 * Stars rise with crimes and fall only while the player is out of police sight.
 * Running from the police for a long time escalates instead, so hiding beats
 * outrunning — which is what makes parks and plazas (unreachable by patrol
 * cars) worth knowing about.
 */

export type Crime = 'hitPed' | 'carjack' | 'carjackPolice' | 'hitPolice';

export const MAX_STARS = 5;

/** Seconds out of sight per star, plus this much extra per star already held. */
const EVADE_BASE = 20;
const EVADE_PER_STAR = 2.5;

/** Seconds of active pursuit before the response escalates by one star. */
const CHASE_ESCALATE = 40;

/** Grace period after a star is lost, so levels do not cascade in one breath. */
const STAR_DROP_GRACE = 2;

const CRIME_STARS: Record<Crime, number> = {
  hitPed: 1,
  carjack: 1,
  carjackPolice: 2,
  hitPolice: 1,
};

/** Police units dispatched per star. */
const UNITS_PER_STAR = [0, 1, 2, 3, 4, 5];

export interface WantedListener {
  onStarsChanged?: (stars: number, previous: number) => void;
}

export class WantedSystem {
  stars = 0;
  /** Seconds spent out of police sight since the last sighting. */
  evadeTimer = 0;
  /** Seconds spent under active pursuit. */
  chaseTimer = 0;

  private listener: WantedListener;

  constructor(listener: WantedListener = {}) {
    this.listener = listener;
  }

  /** True while the star meter is actively draining (drawn greyed out). */
  get evading(): boolean {
    return this.stars > 0 && this.evadeTimer > STAR_DROP_GRACE;
  }

  /** Seconds of hiding still required to drop the current star. */
  get evadeRemaining(): number {
    if (this.stars === 0) return 0;
    return Math.max(0, this.evadeThreshold() - this.evadeTimer);
  }

  private evadeThreshold(): number {
    return EVADE_BASE + EVADE_PER_STAR * this.stars;
  }

  addCrime(crime: Crime): void {
    this.set(this.stars + CRIME_STARS[crime]);
    // Committing a crime always restarts the hiding clock.
    this.evadeTimer = 0;
  }

  set(n: number): void {
    const prev = this.stars;
    this.stars = Math.max(0, Math.min(MAX_STARS, Math.round(n)));
    if (this.stars !== prev) {
      this.evadeTimer = 0;
      this.chaseTimer = 0;
      this.listener.onStarsChanged?.(this.stars, prev);
    }
  }

  clear(): void {
    this.set(0);
    this.evadeTimer = 0;
    this.chaseTimer = 0;
  }

  /**
   * Advance the meter.
   *
   * @param seen    any police unit currently has the player in sight
   * @param chased  the player is being actively pursued (seen while wanted)
   * @returns how many police units should be on the street right now
   */
  update(dt: number, seen: boolean, chased: boolean): number {
    if (this.stars === 0) {
      this.evadeTimer = 0;
      this.chaseTimer = 0;
      return 0;
    }

    if (seen) {
      this.evadeTimer = 0;
    } else {
      this.evadeTimer += dt;
      if (this.evadeTimer >= this.evadeThreshold()) {
        this.set(this.stars - 1);
        return this.targetUnits();
      }
    }

    if (chased) {
      this.chaseTimer += dt;
      if (this.chaseTimer >= CHASE_ESCALATE && this.stars < MAX_STARS) {
        this.set(this.stars + 1);
      }
    } else {
      this.chaseTimer = 0;
    }

    return this.targetUnits();
  }

  targetUnits(): number {
    return UNITS_PER_STAR[this.stars] ?? 0;
  }
}
