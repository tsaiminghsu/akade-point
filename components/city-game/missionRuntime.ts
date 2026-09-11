import { Player, VehicleType } from './types';
import { MissionDef, MissionKind, MissionObjective } from './missions';

/**
 * Mission state machine.
 *
 * Follows the same shape as race.ts: the session is a fat mutable struct that
 * is updated in place and returns an event, so the hot path allocates nothing.
 */

export type MissionPhase = 'briefing' | 'active' | 'success' | 'failed';

export type MissionEvent = 'none' | 'objective' | 'fare' | 'success' | 'failed';

/** Seconds a bound vehicle may be abandoned before the run fails. */
export const ABANDON_GRACE = 15;
/** Below this speed (px/s) the player counts as stopped. */
export const STOPPED_SPEED = 15;
/** How long the success/failure banner is held before the session clears. */
export const RESULT_HOLD = 3;

export interface Passenger {
  x: number;
  y: number;
  state: 'waiting' | 'riding';
}

export interface MissionSession {
  defId: string;
  kind: MissionKind;
  phase: MissionPhase;
  objectives: MissionObjective[];
  currentIndex: number;
  startedAt: number;
  elapsed: number;
  /** Seconds remaining, or null when untimed. */
  timeLeft: number | null;
  /** The full limit for the current leg, used to scale bonuses. */
  timeLimit: number | null;
  /** Vehicle the run is bound to, if any. */
  vehicleId: string | null;
  /** Counts down while the player is out of the bound vehicle. */
  abandonTimer: number;
  collisions: number;
  faresCompleted: number;
  earned: number;
  passenger: Passenger | null;
  failReason: string | null;
  resultText: string;
  /** performance.now() when the run ended, for the result hold. */
  endedAt: number;
}

export interface MissionTickInput {
  px: number;
  py: number;
  /** True px/s speed. */
  speed: number;
  playerState: Player['state'];
  vehicleType: VehicleType | null;
  vehicleId: string | null;
  wantedLevel: number;
  dt: number;
  nowMs: number;
}

export function createSession(
  def: MissionDef,
  objectives: MissionObjective[],
  timeLimit: number | null,
  nowMs: number,
): MissionSession {
  return {
    defId: def.id,
    kind: def.kind,
    phase: 'briefing',
    objectives,
    currentIndex: 0,
    startedAt: nowMs,
    elapsed: 0,
    timeLeft: timeLimit,
    timeLimit,
    vehicleId: null,
    abandonTimer: 0,
    collisions: 0,
    faresCompleted: 0,
    earned: 0,
    passenger: null,
    failReason: null,
    resultText: '',
    endedAt: 0,
  };
}

export function currentObjective(s: MissionSession): MissionObjective | null {
  return s.objectives[s.currentIndex] ?? null;
}

export function failMission(s: MissionSession, reason: string, nowMs: number): void {
  if (s.phase === 'failed' || s.phase === 'success') return;
  s.phase = 'failed';
  s.failReason = reason;
  s.resultText = `任務失敗 — ${reason}`;
  s.endedAt = nowMs;
}

export function succeedMission(s: MissionSession, nowMs: number): void {
  if (s.phase === 'failed' || s.phase === 'success') return;
  s.phase = 'success';
  s.resultText = `任務完成 +$${s.earned}`;
  s.endedAt = nowMs;
}

export function inRadius(px: number, py: number, x: number, y: number, r: number): boolean {
  return Math.hypot(px - x, py - y) <= r;
}

/** Time bonus for the courier job: full bonus at half the limit remaining. */
export function computeCourierBonus(timeLeft: number, timeLimit: number, max = 100): number {
  if (timeLimit <= 0) return 0;
  const frac = Math.max(0, Math.min(1, timeLeft / timeLimit));
  return Math.round(max * frac);
}

/** Taxi tip: rewards speed, punishes scrapes. Never negative. */
export function computeTaxiTip(
  baseFare: number,
  timeLeft: number,
  timeLimit: number,
  collisions: number,
): number {
  if (timeLimit <= 0) return 0;
  const frac = Math.max(0, Math.min(1, timeLeft / timeLimit));
  const tip = baseFare * 0.5 * frac - collisions * 10;
  return Math.max(0, Math.round(tip));
}

/** Delivery pay for a completed run. */
export function computeDeliveryPay(drops: number, perDrop: number, bonus: number, collisions: number): number {
  return Math.max(0, drops * perDrop + bonus - collisions * 20);
}

export function formatMissionTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Advance the session by one tick.
 *
 * The manager is responsible for reacting to the returned event (paying out,
 * chaining a new taxi fare, spawning the next passenger, and so on).
 */
export function tickMission(
  s: MissionSession,
  def: MissionDef,
  inp: MissionTickInput,
): MissionEvent {
  if (s.phase === 'briefing') return 'none';
  if (s.phase !== 'active') return 'none';

  s.elapsed += inp.dt;

  // ── Time limit ──────────────────────────────────────────────────────────
  if (s.timeLeft !== null) {
    s.timeLeft -= inp.dt;
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      failMission(s, '超時', inp.nowMs);
      return 'failed';
    }
  }

  // ── Abandoning the job vehicle ──────────────────────────────────────────
  if (s.vehicleId && def.requiredVehicle) {
    const inBoundVehicle = inp.vehicleId === s.vehicleId;
    if (inBoundVehicle) {
      s.abandonTimer = 0;
    } else {
      s.abandonTimer += inp.dt;
      if (s.abandonTimer >= ABANDON_GRACE) {
        failMission(s, '離開車輛', inp.nowMs);
        return 'failed';
      }
    }
  }

  const objective = currentObjective(s);
  if (!objective) {
    succeedMission(s, inp.nowMs);
    return 'success';
  }

  // ── Objective completion ────────────────────────────────────────────────
  let complete = false;

  switch (objective.kind) {
    case 'enterVehicle':
      complete = inp.vehicleType === objective.vehicleType && inp.vehicleId !== null;
      if (complete) s.vehicleId = inp.vehicleId;
      break;

    case 'loseWanted':
      complete = inp.wantedLevel === 0;
      break;

    default: {
      // reach / pickup / dropoff are all radius triggers.
      if (!inRadius(inp.px, inp.py, objective.x, objective.y, objective.radius)) break;
      if (objective.requireStopped && Math.abs(inp.speed) > STOPPED_SPEED) break;
      complete = true;
      break;
    }
  }

  if (!complete) return 'none';

  objective.done = true;

  // A taxi drop-off completes a fare rather than the whole job.
  if (s.kind === 'taxi' && objective.kind === 'dropoff') {
    s.faresCompleted += 1;
    s.currentIndex += 1;
    return 'fare';
  }

  s.currentIndex += 1;

  if (s.currentIndex >= s.objectives.length) {
    // Taxi work never "finishes" on its own — the manager appends a new fare.
    if (s.kind === 'taxi') return 'objective';
    succeedMission(s, inp.nowMs);
    return 'success';
  }

  return 'objective';
}
