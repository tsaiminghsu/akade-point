import { describe, it, expect } from 'vitest';
import {
  ADAPT_GRACE,
  ADAPT_SETTLE,
  ADAPT_SUSTAIN,
  AdaptiveAction,
  AdaptiveState,
  adaptiveStep,
  createAdaptiveState,
  nextStepDown,
  targetFps,
} from '../adaptiveQuality';
import { GraphicsSettings, MIN_BUDGET_SCALE, presetSettings } from '../graphicsSettings';

/** Feed samples twice a second from `from` to `to` (seconds). */
function run(
  state: AdaptiveState,
  settings: GraphicsSettings,
  from: number,
  to: number,
  fps: number,
  active = true,
) {
  const actions: Exclude<AdaptiveAction, { kind: 'none' }>[] = [];
  let s = state;
  let g = settings;
  for (let t = from; t <= to + 1e-9; t += 0.5) {
    const r = adaptiveStep(s, { now: t, fps, active }, g);
    s = r.state;
    if (r.action.kind !== 'none') {
      actions.push(r.action);
      g = r.action.settings;
    }
  }
  return { state: s, settings: g, actions };
}

describe('targetFps', () => {
  it('defends the cap, but never more than 60', () => {
    expect(targetFps(30)).toBe(30);
    expect(targetFps(60)).toBe(60);
    expect(targetFps(144)).toBe(60);
    expect(targetFps(0)).toBe(60);
  });
});

describe('adaptiveStep', () => {
  it('leaves a smooth game alone', () => {
    const r = run(createAdaptiveState(0), presetSettings('high'), 0, 60, 60);
    expect(r.actions).toEqual([]);
  });

  it('ignores the first seconds after load', () => {
    const r = run(createAdaptiveState(0), presetSettings('high'), 0, ADAPT_GRACE - 0.5, 10);
    expect(r.actions).toEqual([]);
  });

  it('needs a sustained drop, not a hitch', () => {
    const settings = presetSettings('high');
    let r = run(createAdaptiveState(0), settings, 0, ADAPT_GRACE, 60);
    // 3 s of stutter, then smooth again.
    r = run(r.state, settings, ADAPT_GRACE + 0.5, ADAPT_GRACE + 3, 20);
    r = run(r.state, settings, ADAPT_GRACE + 3.5, ADAPT_GRACE + 20, 60);
    expect(r.actions).toEqual([]);
  });

  it('cuts the pixel budget first, then drops a tier', () => {
    const start = presetSettings('high');
    const r = run(createAdaptiveState(0), start, 0, 120, 20);
    expect(r.actions.length).toBeGreaterThanOrEqual(4);
    const kinds = r.actions.map(a => a.kind);
    // Budget steps until the floor, then the preset.
    const firstTier = kinds.indexOf('tier');
    expect(firstTier).toBeGreaterThan(0);
    expect(kinds.slice(0, firstTier).every(k => k === 'budget')).toBe(true);
    const beforeTier = r.actions[firstTier - 1].settings;
    expect(beforeTier.budgetScale).toBeCloseTo(MIN_BUDGET_SCALE);
    expect(r.actions[firstTier].settings.preset).toBe('medium');
  });

  it('waits for new settings to settle between steps', () => {
    const r = run(createAdaptiveState(0), presetSettings('high'), 0, ADAPT_GRACE + ADAPT_SUSTAIN + ADAPT_SETTLE, 20);
    expect(r.actions.length).toBe(1);
  });

  it('only ever steps down', () => {
    const r = run(createAdaptiveState(0), presetSettings('low'), 0, 600, 5);
    for (const a of r.actions) expect(a.kind).toBe('budget');
    expect(r.settings.preset).toBe('low');
    expect(r.settings.budgetScale).toBeCloseTo(MIN_BUDGET_SCALE);
    // At the floor: nothing further to take.
    expect(nextStepDown(r.settings)).toBeNull();
  });

  it('does nothing while paused, loading or switched off', () => {
    expect(run(createAdaptiveState(0), presetSettings('high'), 0, 120, 5, false).actions).toEqual([]);
    const off = { ...presetSettings('high'), autoAdjust: false };
    expect(run(createAdaptiveState(0), off, 0, 120, 5).actions).toEqual([]);
  });

  it('gives a grace period after coming back from a pause or hidden tab', () => {
    let r = run(createAdaptiveState(0), presetSettings('high'), 0, 30, 60);
    // Tab hidden: no samples for a minute. The first ones back are low.
    r = run(r.state, presetSettings('high'), 90, 90 + ADAPT_SETTLE + ADAPT_SUSTAIN - 1, 15);
    expect(r.actions).toEqual([]);
  });

  it('judges a 30 fps cap against 30, not 60', () => {
    const low = presetSettings('low'); // capped at 30
    expect(run(createAdaptiveState(0), low, 0, 120, 29).actions).toEqual([]);
    expect(run(createAdaptiveState(0), low, 0, 120, 20).actions.length).toBeGreaterThan(0);
  });

  it('leaves a custom setup custom, touching only its budget', () => {
    // The stored preset name still says "high"; the values say otherwise.
    const custom = { ...presetSettings('high'), shadowDistance: 123 };
    const r = run(createAdaptiveState(0), custom, 0, 300, 10);
    for (const a of r.actions) expect(a.kind).toBe('budget');
    expect(r.settings.shadowDistance).toBe(123);
  });
});
