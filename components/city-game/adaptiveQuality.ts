/**
 * Auto-adjust: step quality down when the frame rate stays too low.
 *
 * The detected preset is a guess from the GPU name; this is the safety net
 * for when the guess is wrong (a hot laptop on battery, a weak CPU behind a
 * strong GPU, a 4K screen). It only ever steps DOWN — raising quality back is
 * the player's call — and only after a sustained drop, so a single hitch while
 * chunks stream in never costs anything.
 *
 * Pure: the caller feeds it fps samples with timestamps and applies whatever
 * it returns. No React, no timers.
 */

import {
  GraphicsSettings,
  MIN_BUDGET_SCALE,
  detectPreset,
  presetSettings,
} from './graphicsSettings';

/** Seconds after load (and after any pause or tab switch) before judging. */
export const ADAPT_GRACE = 10;
/** Seconds after a step before judging again, while the new settings settle. */
export const ADAPT_SETTLE = 4;
/** Seconds the frame rate must stay low before a step. */
export const ADAPT_SUSTAIN = 5;
/** "Low" means below this fraction of the target. */
export const ADAPT_THRESHOLD = 0.8;
/** Each budget step keeps this much of the pixel budget. */
export const ADAPT_BUDGET_STEP = 0.75;
/** A gap between samples longer than this is a pause, not a slow frame. */
const SAMPLE_GAP = 1.5;

export interface AdaptiveState {
  /** No judgement before this time (seconds). */
  settleUntil: number;
  /** When the current low stretch began, or null. */
  lowSince: number | null;
  /** Time of the previous sample. */
  lastSample: number;
}

export function createAdaptiveState(now: number): AdaptiveState {
  return { settleUntil: now + ADAPT_GRACE, lowSince: null, lastSample: now };
}

/**
 * The frame rate auto-adjust defends. Capped at 60 even on a 144 Hz setting:
 * without a way to tell a 60 Hz screen from a slow GPU, a higher target would
 * downgrade every machine plugged into a 60 Hz monitor.
 */
export function targetFps(fpsCap: number): number {
  return fpsCap > 0 ? Math.min(fpsCap, 60) : 60;
}

export type AdaptiveAction =
  | { kind: 'none' }
  /** Lower the pixel budget. */
  | { kind: 'budget'; settings: GraphicsSettings }
  /** Drop to the next preset down. */
  | { kind: 'tier'; settings: GraphicsSettings };

const LOWER: Record<'ultra' | 'high' | 'medium', 'high' | 'medium' | 'low'> = {
  ultra: 'high',
  high: 'medium',
  medium: 'low',
};

/** The next step down from these settings, or null at the floor. */
export function nextStepDown(s: GraphicsSettings): AdaptiveAction | null {
  if (s.budgetScale > MIN_BUDGET_SCALE + 1e-6) {
    const budgetScale = Math.max(MIN_BUDGET_SCALE, s.budgetScale * ADAPT_BUDGET_STEP);
    return { kind: 'budget', settings: { ...s, budgetScale } };
  }
  // A hand-tuned setup is the player's; only its budget is ours. (`preset`
  // is not rewritten when a single option changes, so ask detectPreset.)
  const preset = detectPreset(s);
  if (preset === 'ultra' || preset === 'high' || preset === 'medium') {
    return { kind: 'tier', settings: presetSettings(LOWER[preset], { autoAdjust: s.autoAdjust }) };
  }
  return null;
}

export interface AdaptiveSample {
  /** Seconds (performance.now() / 1000). */
  now: number;
  /** Frames actually drawn per second over the last window. */
  fps: number;
  /** False while loading, paused, or in a menu. */
  active: boolean;
}

/**
 * Feed one fps sample. Returns the new state and what to do, if anything.
 */
export function adaptiveStep(
  state: AdaptiveState,
  sample: AdaptiveSample,
  settings: GraphicsSettings,
): { state: AdaptiveState; action: AdaptiveAction } {
  const none = { kind: 'none' } as const;
  const { now } = sample;
  let settleUntil = state.settleUntil;

  // After a pause, a hidden tab or a stall, the first samples measure the
  // gap, not the game.
  if (!sample.active || now - state.lastSample > SAMPLE_GAP) {
    settleUntil = Math.max(settleUntil, now + (sample.active ? ADAPT_SETTLE : ADAPT_GRACE));
  }
  const next: AdaptiveState = { settleUntil, lowSince: state.lowSince, lastSample: now };

  if (!settings.autoAdjust || !sample.active || now < settleUntil) {
    next.lowSince = null;
    return { state: next, action: none };
  }

  if (sample.fps >= targetFps(settings.fpsCap) * ADAPT_THRESHOLD) {
    next.lowSince = null;
    return { state: next, action: none };
  }

  if (next.lowSince === null) next.lowSince = now;
  if (now - next.lowSince < ADAPT_SUSTAIN) return { state: next, action: none };

  const step = nextStepDown(settings);
  if (!step) {
    // Already at the floor: stop checking for a while rather than every sample.
    return { state: { ...next, lowSince: null, settleUntil: now + ADAPT_GRACE }, action: none };
  }
  return { state: { ...next, lowSince: null, settleUntil: now + ADAPT_SETTLE }, action: step };
}
