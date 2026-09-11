import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_SENSOR,
  detectionProbability,
  echoWidthDeg,
  sweptThrough,
} from './radar';
import { DEFAULT_CONFIG, sampleCoastline } from './engine';
import { isLineOfSightBlocked } from './world';
import type { RadarConfig } from './types';

const cfg: RadarConfig = DEFAULT_CONFIG;
const env = DEFAULT_ENVIRONMENT;

describe('sweptThrough', () => {
  it('catches a bearing inside an ordinary arc', () => {
    expect(sweptThrough(10, 20, 15)).toBe(true);
    expect(sweptThrough(10, 20, 25)).toBe(false);
  });

  it('catches a bearing in an arc that wraps past north', () => {
    expect(sweptThrough(355, 5, 0)).toBe(true);
    expect(sweptThrough(355, 5, 358)).toBe(true);
    expect(sweptThrough(355, 5, 180)).toBe(false);
  });

  it('does not fire on a zero-width arc', () => {
    expect(sweptThrough(90, 90, 90)).toBe(false);
  });
});

describe('detectionProbability', () => {
  it('falls off steeply with range', () => {
    const near = detectionProbability(2, 1, cfg, DEFAULT_SENSOR, env);
    const far = detectionProbability(16, 1, cfg, DEFAULT_SENSOR, env);
    expect(near).toBeGreaterThan(0.9);
    expect(far).toBeLessThan(near / 2);
  });

  it('favours a large target over a small one at the same range', () => {
    const big = detectionProbability(10, 1, cfg, DEFAULT_SENSOR, env);
    const small = detectionProbability(10, 0.16, cfg, DEFAULT_SENSOR, env);
    expect(big).toBeGreaterThan(small);
  });

  it('sees nothing beyond the instrumented range or inside the blind zone', () => {
    expect(detectionProbability(40, 1, cfg, DEFAULT_SENSOR, env)).toBe(0);
    expect(detectionProbability(0.01, 1, cfg, DEFAULT_SENSOR, env)).toBe(0);
  });

  it('loses distant targets when the gain is wound down', () => {
    const nominal = detectionProbability(12, 0.5, cfg, DEFAULT_SENSOR, env);
    const low = detectionProbability(12, 0.5, { ...cfg, gain: 0.05 }, DEFAULT_SENSOR, env);
    expect(low).toBeLessThan(nominal);
  });

  it('eats into a close-in target when the STC is driven hard', () => {
    // The mis-tuning trap on a real set: winding the sea-clutter control to
    // maximum digs a hole in short-range sensitivity along with the clutter.
    const calm = { seaState: 0, rainRate: 0 };
    const noStc = detectionProbability(0.6, 0.16, { ...cfg, seaClutter: 0 }, DEFAULT_SENSOR, calm);
    const fullStc = detectionProbability(0.6, 0.16, { ...cfg, seaClutter: 1 }, DEFAULT_SENSOR, calm);
    expect(fullStc).toBeLessThan(noStc * 0.75);
  });

  it('leaves the far field alone when the STC is applied', () => {
    // Sensitivity time control is a short-range gain taper, so a target out at
    // the edge of the picture must not notice it.
    const far = 12;
    const off = detectionProbability(far, 1, { ...cfg, seaClutter: 0 }, DEFAULT_SENSOR, env);
    const on = detectionProbability(far, 1, { ...cfg, seaClutter: 1 }, DEFAULT_SENSOR, env);
    expect(on).toBeCloseTo(off, 2);
  });

  it('drops with heavy rain on the path', () => {
    const clear = detectionProbability(10, 0.7, cfg, DEFAULT_SENSOR, { seaState: 2, rainRate: 0 });
    const wet = detectionProbability(10, 0.7, cfg, DEFAULT_SENSOR, { seaState: 2, rainRate: 1 });
    expect(wet).toBeLessThan(clear);
  });
});

describe('echoWidthDeg', () => {
  it('is never narrower than the beam', () => {
    expect(echoWidthDeg(20, 0, 8, 1.8)).toBeGreaterThanOrEqual(1.8);
  });

  it('paints a long hull wider broadside than bow-on', () => {
    const broadside = echoWidthDeg(300, 90, 1, 1.8);
    const bowOn = echoWidthDeg(300, 0, 1, 1.8);
    expect(broadside).toBeGreaterThan(bowOn);
    // 300 m across 1 NM subtends roughly nine degrees.
    expect(broadside).toBeGreaterThan(9);
  });

  it('shrinks with range', () => {
    expect(echoWidthDeg(300, 90, 6, 1.8)).toBeLessThan(echoWidthDeg(300, 90, 1, 1.8));
  });
});

describe('coastline masking', () => {
  it('blocks a view from seaward into the inner harbour', () => {
    // Own ship west of Cijin, target alongside inside the harbour.
    expect(
      isLineOfSightBlocked({ lat: 22.595, lon: 120.23 }, { lat: 22.6091, lon: 120.2823 })
    ).toBe(true);
  });

  it('leaves open water clear', () => {
    expect(
      isLineOfSightBlocked({ lat: 22.595, lon: 120.23 }, { lat: 22.5672, lon: 120.2793 })
    ).toBe(false);
  });
});

describe('sampleCoastline', () => {
  it('produces points spaced no further apart than the step', () => {
    const pts = sampleCoastline(0.1, [[
      { lat: 22.6, lon: 120.2 },
      { lat: 22.6, lon: 120.25 },
    ]]);
    expect(pts.length).toBeGreaterThan(5);
    expect(pts[0]).toEqual({ lat: 22.6, lon: 120.2 });
    expect(pts[pts.length - 1]).toEqual({ lat: 22.6, lon: 120.25 });
  });
});
