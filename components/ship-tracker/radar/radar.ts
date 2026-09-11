/**
 * Radar sensor model.
 *
 * The point of this file is that the tracker must not be handed the truth. A
 * real scope only ever sees echoes: they arrive when the rotating beam sweeps
 * past a target, they carry range and bearing noise, they go missing when the
 * signal-to-noise ratio is poor, and they are mixed with clutter that looks
 * exactly like a small vessel until you watch it for a few scans.
 *
 * Everything here works off the radar equation in a simplified form, so the
 * anti-clutter controls on the console behave the way the real ones do,
 * including the ways they can be mis-tuned.
 */

import { bearingDelta, initialBearing, haversineNm, M_PER_NM, normalizeDeg } from './geo';
import type { LatLon, OwnShip, RadarPlot, RadarConfig, Vessel } from './types';

export interface RadarSensor {
  /** Horizontal beam width at -3 dB, degrees. A 4 ft X-band array is about 1.8. */
  beamWidthDeg: number;
  /** Instrumented maximum range, NM. */
  maxRangeNm: number;
  /** One-sigma bearing error, degrees. */
  bearingNoiseDeg: number;
  /** One-sigma range error, NM. */
  rangeNoiseNm: number;
  /**
   * Reference range in NM at which a unit-RCS target sits at the detection
   * threshold with nominal gain. Sets the whole detection curve.
   */
  referenceRangeNm: number;
  /** Minimum range, inside which the transmit pulse blinds the receiver. */
  minRangeNm: number;
}

export const DEFAULT_SENSOR: RadarSensor = {
  beamWidthDeg: 1.8,
  maxRangeNm: 24,
  bearingNoiseDeg: 0.35,
  rangeNoiseNm: 0.012,
  referenceRangeNm: 9,
  minRangeNm: 0.04,
};

/** Conditions outside the operator's control. They only tune the receiver. */
export interface Environment {
  /** Douglas sea state 0..6. Drives sea clutter close in. */
  seaState: number;
  /** Rain rate 0..1. Drives attenuation and rain clutter. */
  rainRate: number;
}

export const DEFAULT_ENVIRONMENT: Environment = { seaState: 2, rainRate: 0 };

/**
 * Probability that one beam crossing produces a detectable echo.
 *
 * Signal falls off as the fourth power of range, so a target at twice the
 * distance returns a sixteenth of the power. Sea clutter is modelled as an
 * additive interference that decays exponentially with range and is knocked
 * down by the sensitivity time control, and rain both attenuates the two-way
 * path and adds its own returns.
 *
 * The mis-tuning behaviours are deliberate: too much STC suppresses genuine
 * close targets along with the clutter, and too little gain loses distant
 * ones.
 */
export function detectionProbability(
  rangeNm: number,
  rcs: number,
  config: RadarConfig,
  sensor: RadarSensor,
  env: Environment
): number {
  if (rangeNm < sensor.minRangeNm || rangeNm > sensor.maxRangeNm) return 0;

  const r = Math.max(rangeNm, 0.05);

  // Two-way rain attenuation along the path.
  const rainLoss = Math.exp(-1.1 * env.rainRate * r * 0.15);

  // Radar equation, normalised so a unit-RCS target at the reference range
  // sits near the detection threshold at nominal gain.
  const snr =
    (0.35 + config.gain * 1.8) *
    rcs *
    Math.pow(sensor.referenceRangeNm / r, 4) *
    rainLoss;

  // Residual sea clutter after the STC has done its work.
  const clutter =
    Math.exp(-r / (0.6 + env.seaState * 0.35)) *
    (env.seaState / 6) *
    (1 - config.seaClutter);

  // Residual rain clutter after the FTC.
  const rainClutterResidual = env.rainRate * (1 - config.rainClutter) * 0.6;

  const effectiveSnr = snr / (1 + 9 * clutter + 4 * rainClutterResidual);

  // A hard STC setting drills a hole in short-range sensitivity, which is
  // exactly the trap it is on a real set.
  const stcSuppression = 1 - 0.55 * config.seaClutter * Math.exp(-r / 2.2);

  const pd = (effectiveSnr / (1 + effectiveSnr)) * stcSuppression;
  return Math.max(0, Math.min(0.995, pd));
}

/**
 * Angular width of a target's echo.
 *
 * Beam width smears every target, and on top of that a long hull seen broadside
 * genuinely subtends a large angle at close range: a 300 m ship at 1 NM covers
 * more than nine degrees. Aspect angle decides how much of that length is
 * presented.
 */
export function echoWidthDeg(
  lengthM: number,
  aspectDeg: number,
  rangeNm: number,
  beamWidthDeg: number
): number {
  const beamM = Math.max(6, lengthM * 0.16);
  const a = (aspectDeg * Math.PI) / 180;
  const presentedM = Math.abs(lengthM * Math.sin(a)) + Math.abs(beamM * Math.cos(a));
  const subtended = (presentedM / M_PER_NM / Math.max(rangeNm, 0.05)) * (180 / Math.PI);
  return beamWidthDeg + subtended;
}

/** Box-Muller normal deviate, driven by an injected uniform source. */
export function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Whether a bearing was swept between two antenna angles.
 * Handles the wrap through north, which is where naive versions drop a target
 * once per revolution.
 */
export function sweptThrough(prev: number, next: number, bearing: number): boolean {
  const p = normalizeDeg(prev);
  const n = normalizeDeg(next);
  const b = normalizeDeg(bearing);
  if (Math.abs(n - p) < 1e-9) return false;
  return p <= n ? b > p && b <= n : b > p || b <= n;
}

export interface SweepResult {
  plots: RadarPlot[];
  /** Angular width actually swept, degrees. */
  arcDeg: number;
}

let plotSeq = 0;

/**
 * Advance the antenna from `prevAngle` to `nextAngle` and return every echo
 * the beam produced on the way, real and spurious alike.
 */
export function sweep(
  prevAngle: number,
  nextAngle: number,
  ownPos: LatLon,
  own: OwnShip,
  vessels: Vessel[],
  config: RadarConfig,
  sensor: RadarSensor,
  env: Environment,
  now: number,
  rand: () => number
): SweepResult {
  const plots: RadarPlot[] = [];
  // Taken as a raw difference, not a normalised one: the caller passes a
  // monotonically increasing angle, and normalising would turn a full
  // revolution into a zero-width arc and silently emit no clutter at all.
  const arc = Math.min(360, Math.max(0, nextAngle - prevAngle));

  for (const v of vessels) {
    const trueBearing = initialBearing(ownPos, v.pos);
    if (!sweptThrough(prevAngle, nextAngle, trueBearing)) continue;

    const trueRange = haversineNm(ownPos, v.pos);
    const pd = detectionProbability(trueRange, v.rcs, config, sensor, env);
    if (rand() > pd) continue;

    // Bearing error is dominated by beam-width quantisation, range error by
    // pulse length. Both scale a little with a weak return.
    const snrPenalty = 1 + (1 - pd) * 1.5;
    const bearing = normalizeDeg(
      trueBearing + gaussian(rand) * sensor.bearingNoiseDeg * snrPenalty
    );
    const rangeNm = Math.max(
      sensor.minRangeNm,
      trueRange + gaussian(rand) * sensor.rangeNoiseNm * snrPenalty
    );

    const aspect = bearingDelta(trueBearing, v.heading) + 90;

    plots.push({
      id: `p${plotSeq++}`,
      t: now,
      rangeNm,
      bearing,
      strength: Math.min(1, 0.35 + pd * 0.65),
      widthDeg: echoWidthDeg(v.lengthM, aspect, trueRange, sensor.beamWidthDeg),
      truthMmsi: v.mmsi,
    });
  }

  // Clutter. These are indistinguishable from a small vessel in a single scan,
  // which is the whole reason the tracker needs several before it commits.
  const arcFraction = arc / 360;

  const seaBlips = env.seaState * 9 * (1 - config.seaClutter) * (0.3 + config.gain) * arcFraction;
  const clutterScaleNm = 0.35 + env.seaState * 0.18;
  emitClutter(plots, seaBlips, rand, now, () => {
    // Sea clutter hugs own ship, but the number of returns at a given range is
    // the clutter strength there times the area available, and the area of a
    // ring vanishes at the centre. Sampling range directly from a
    // centre-weighted curve therefore piles blips into a singularity on top of
    // own ship, dense enough for the tracker to chain them into phantom ships
    // sitting on the bow at fifty knots.
    //
    // The sum of two exponentials gives a density proportional to
    // r * exp(-r / L): zero at the origin, peaking about one scale length out,
    // with a tail into the middle distance. That is the ring of clutter a real
    // set paints in a rising sea.
    const r =
      -clutterScaleNm * (Math.log(1 - rand() * 0.999) + Math.log(1 - rand() * 0.999));
    return Math.max(sensor.minRangeNm, r);
  }, prevAngle, arc, sensor.beamWidthDeg);

  // Rain fills the volume the beam passes through, so returns are spread over
  // the area of the screen rather than along the radius.
  const rainBlips =
    env.rainRate * 26 * (1 - config.rainClutter) * (0.3 + config.gain) * arcFraction;
  emitClutter(
    plots,
    rainBlips,
    rand,
    now,
    () => config.rangeNm * Math.sqrt(rand()),
    prevAngle,
    arc,
    sensor.beamWidthDeg * 2
  );

  // Receiver noise, which only appears once the gain is wound past useful.
  const noiseBlips = Math.max(0, config.gain - 0.78) * 90 * arcFraction;
  emitClutter(plots, noiseBlips, rand, now, () => rand() * config.rangeNm, prevAngle, arc, sensor.beamWidthDeg);

  return { plots, arcDeg: arc };
}

function emitClutter(
  out: RadarPlot[],
  expected: number,
  rand: () => number,
  now: number,
  sampleRange: () => number,
  fromAngle: number,
  arc: number,
  widthDeg: number
): void {
  let count = Math.floor(expected);
  if (rand() < expected - count) count += 1;
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: `c${plotSeq++}`,
      t: now,
      rangeNm: sampleRange(),
      bearing: normalizeDeg(fromAngle + rand() * arc),
      strength: 0.2 + rand() * 0.35,
      widthDeg,
    });
  }
}
