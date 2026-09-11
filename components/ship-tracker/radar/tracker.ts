/**
 * Alpha-beta target tracker.
 *
 * This is the piece that turns a scatter of unlabelled radar plots into
 * persistent tracks with velocity. It runs once per antenna revolution, which
 * is how a real ARPA works: the association problem is only well posed when
 * you have a full picture of the scene.
 *
 * The filter is an expanding-memory polynomial filter whose gains decay with
 * the number of updates, then floor at a steady-state value. That gives a new
 * track fast convergence and a mature track a smooth velocity estimate, while
 * the floor keeps it responsive to a genuine manoeuvre instead of stiffening
 * into a straight line forever.
 */

import { polarToVec } from './geo';
import type { RadarPlot, Track, TrackStatus, Vec2 } from './types';

export interface TrackerConfig {
  /** Hits required before a tentative track is promoted to confirmed. */
  confirmHits: number;
  /** Consecutive missed scans before a coasting track is dropped. */
  maxMisses: number;
  /**
   * One-sigma bearing error of the sensor feeding this tracker, degrees. The
   * gate is derived from it, so it must match the sensor actually in use.
   */
  bearingNoiseDeg: number;
  /** One-sigma range error of the sensor, NM. */
  rangeNoiseNm: number;
  /** Gate width in standard deviations of the measurement error. */
  gateSigmas: number;
  /**
   * How far a candidate track's history may scatter from a straight line, in
   * standard deviations, and still be confirmed.
   */
  straightnessSigmas: number;
  /** Fastest target worth tracking, knots. Sets the gate for a new track and
   *  rejects tracks whose filtered speed is physically implausible. */
  maxTargetSpeedKn: number;
  /**
   * Closest range at which a new track may be started, NM.
   *
   * Receiver noise and clutter are spread evenly along each radial, so their
   * density per unit area climbs without limit toward the centre of the screen,
   * and a handful of blips in that tiny area will chain into a track. Real sets
   * refuse to auto-acquire inside a minimum range for the same reason. An
   * existing track still updates through this zone; only new ones are blocked.
   */
  minAcquireRangeNm: number;
  /** Steady-state position gain floor. */
  minAlpha: number;
  /** Steady-state velocity gain floor. */
  minBeta: number;
  /**
   * Residual multiple, against the track's own smoothed noise level, that
   * counts as the target having manoeuvred. Has to be smaller than
   * `gateSigmas`, or every break large enough to notice is thrown out by the
   * gate before this ever sees it.
   */
  manoeuvreThreshold: number;
  /** Scans the manoeuvre flag stays raised after it trips. */
  manoeuvreHoldScans: number;
  /**
   * Residual magnitude, NM, that the velocity gain floor is tuned for. A track
   * noisier than this gets a proportionally smaller floor.
   */
  nominalNoiseNm: number;
  /** Trail length cap, in samples. */
  maxTrail: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  // Four scans rather than three. Each extra scan a candidate has to survive
  // multiplies the odds of a clutter blip being promoted by the per-scan false
  // association probability, so this is the cheapest lever there is against
  // phantom targets, at the cost of two and a half seconds of acquisition time.
  confirmHits: 4,
  maxMisses: 4,
  bearingNoiseDeg: 0.35,
  rangeNoiseNm: 0.012,
  gateSigmas: 3.5,
  straightnessSigmas: 1.6,
  maxTargetSpeedKn: 35,
  minAcquireRangeNm: 0.15,
  // The velocity gain floor sets the noise floor on reported target speed. An
  // alpha-beta filter passes position noise into velocity at roughly
  // sigma_pos/T * sqrt(2*beta^2 / (alpha*(4-2*alpha-beta))). With bearing noise
  // of a third of a degree at a few miles, beta = 0.08 puts nearly three knots
  // of jitter on every target; beta = 0.02 brings it under one, which is what a
  // real ARPA quotes. The cost is a filter far too sluggish to follow a turn,
  // which is what manoeuvreThreshold below exists to fix.
  minAlpha: 0.25,
  minBeta: 0.02,
  // Must stay below gateSigmas. A break bigger than the gate does not produce
  // a large residual at all: the measurement simply falls outside and the track
  // coasts. Set above the gate this detector can never fire, which is exactly
  // the bug that tightening the gate first introduced.
  manoeuvreThreshold: 2.6,
  manoeuvreHoldScans: 8,
  nominalNoiseNm: 0.02,
  maxTrail: 240,
};

/**
 * Expanding-memory alpha-beta gains for update number `n` (1-based).
 *
 * These are the standard growing-memory polynomial coefficients. They start at
 * alpha = 1 (trust the first measurement completely, since there is nothing
 * else) and decay toward zero, so we clamp them at the configured floor.
 */
export function alphaBetaGains(
  n: number,
  minAlpha: number,
  minBeta: number
): { alpha: number; beta: number } {
  const k = Math.max(1, n);
  const alpha = (2 * (2 * k - 1)) / (k * (k + 1));
  const beta = 6 / (k * (k + 1));
  return {
    alpha: Math.max(minAlpha, Math.min(1, alpha)),
    beta: Math.max(minBeta, Math.min(1, beta)),
  };
}

/** Predict a track forward to time `t` without consuming a measurement. */
export function predict(track: Track, t: number): Vec2 {
  const dt = Math.max(0, (t - track.lastUpdate) / 1000);
  return { x: track.x + track.vx * dt, y: track.y + track.vy * dt };
}

/**
 * Association gate radius for a track, in NM.
 *
 * Sized from the two things that can legitimately separate a prediction from
 * the matching measurement: sensor error, and how far the target could have
 * moved since the last update.
 *
 * The sensor term has to be computed at the measurement's own range, because
 * bearing error converts to a cross-track distance proportional to range. A
 * single fixed gate is either too tight at six miles or, far worse, wide open
 * at half a mile — and half a mile is exactly where sea clutter lives. A gate
 * that stays wide in close is how a clutter blip gets promoted into a phantom
 * ship on a collision course.
 */
/** One-sigma position error of a measurement taken at `rangeNm`. */
function measurementSigma(cfg: TrackerConfig, rangeNm: number): number {
  const crossTrack = ((cfg.bearingNoiseDeg * Math.PI) / 180) * rangeNm;
  return Math.hypot(crossTrack, cfg.rangeNoiseNm);
}

function gateRadius(
  track: Track,
  t: number,
  cfg: TrackerConfig,
  measRangeNm: number
): number {
  const dt = Math.max(0, (t - track.lastUpdate) / 1000);
  const noise = cfg.gateSigmas * measurementSigma(cfg, measRangeNm);

  // A track with no velocity estimate yet has to allow for any plausible
  // target speed. Once the velocity is known, only a manoeuvre needs allowing.
  const motion =
    track.hits < cfg.confirmHits
      ? (cfg.maxTargetSpeedKn / 3600) * dt
      : Math.hypot(track.vx, track.vy) * dt * 0.5 + (4 / 3600) * dt;

  return noise + motion;
}

/**
 * Whether a candidate track's history looks like a vessel rather than a run of
 * luck in the clutter.
 *
 * A ship moves in a straight line at a steady speed over the few seconds an
 * initiation takes, so its measurements scatter about a straight line in time
 * by no more than the sensor's own error. A chain of clutter blips can pass the
 * association gate scan after scan and still wander, because each blip is
 * independent of the last. Fitting position against time and looking at what is
 * left over separates the two, and it is the check that keeps a phantom from
 * ever reaching the collision alarm.
 */
export function isTrackConsistent(
  trail: Array<Vec2 & { t: number }>,
  sigmaNm: number,
  toleranceSigmas: number
): boolean {
  if (trail.length < 3) return false;

  const n = trail.length;
  const t0 = trail[0].t;
  let sumT = 0;
  let sumTT = 0;
  for (const p of trail) {
    const dt = (p.t - t0) / 1000;
    sumT += dt;
    sumTT += dt * dt;
  }
  const denom = n * sumTT - sumT * sumT;
  if (denom <= 1e-9) return false;

  // Least squares fit of each axis against time, then the residual scatter.
  let residualSq = 0;
  for (const axis of ['x', 'y'] as const) {
    let sumV = 0;
    let sumTV = 0;
    for (const p of trail) {
      const dt = (p.t - t0) / 1000;
      sumV += p[axis];
      sumTV += dt * p[axis];
    }
    const slope = (n * sumTV - sumT * sumV) / denom;
    const intercept = (sumV - slope * sumT) / n;
    for (const p of trail) {
      const dt = (p.t - t0) / 1000;
      const r = p[axis] - (intercept + slope * dt);
      residualSq += r * r;
    }
  }

  const rms = Math.sqrt(residualSq / (2 * n));
  return rms <= toleranceSigmas * Math.max(sigmaNm, 1e-4);
}

export class ShipTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private cfg: TrackerConfig;
  /** Last measured range per track, NM, for scaling the noise thresholds. */
  private lastRange = new Map<number, number>();

  constructor(cfg: Partial<TrackerConfig> = {}) {
    this.cfg = { ...DEFAULT_TRACKER_CONFIG, ...cfg };
  }

  getTracks(): Track[] {
    return this.tracks;
  }

  /** Live tracks worth showing: everything except ones queued for deletion. */
  getActiveTracks(): Track[] {
    return this.tracks.filter((t) => t.status !== 'lost');
  }

  reset(): void {
    this.tracks = [];
    this.lastRange.clear();
    this.nextId = 1;
  }

  /**
   * Run one association and update cycle over a scan's worth of plots.
   *
   * `origin` is the scene origin the plots are measured relative to, i.e. own
   * ship's position at the moment each plot was taken. Plots arrive as bearing
   * and range from own ship, so the caller supplies the ground-plane position
   * of own ship at each plot time; that is what keeps the tracks
   * ground-stabilised while the platform itself moves.
   */
  update(
    plots: Array<RadarPlot & { ownVec: Vec2 }>,
    scanTime: number,
    scanPeriodSec = 2.5
  ): void {
    const measurements = plots.map((p) => {
      const offset = polarToVec(p.bearing, p.rangeNm);
      return {
        plot: p,
        pos: { x: p.ownVec.x + offset.x, y: p.ownVec.y + offset.y },
        claimed: false,
      };
    });

    // Association: greedy nearest neighbour, best pairs first. Full auction or
    // JPDA would be better in dense traffic, but greedy-by-global-best-first is
    // what most commercial ARPAs actually do and it is stable enough here.
    const candidates: Array<{ ti: number; mi: number; d: number }> = [];
    this.tracks.forEach((track, ti) => {
      if (track.status === 'lost') return;
      const p = predict(track, scanTime);
      measurements.forEach((m, mi) => {
        const d = Math.hypot(m.pos.x - p.x, m.pos.y - p.y);
        if (d <= gateRadius(track, scanTime, this.cfg, m.plot.rangeNm)) {
          candidates.push({ ti, mi, d });
        }
      });
    });
    candidates.sort((a, b) => a.d - b.d);

    const trackTaken = new Set<number>();
    const pairs = new Map<number, { mi: number; d: number }>();
    for (const c of candidates) {
      if (trackTaken.has(c.ti) || measurements[c.mi].claimed) continue;
      trackTaken.add(c.ti);
      measurements[c.mi].claimed = true;
      pairs.set(c.ti, { mi: c.mi, d: c.d });
    }

    // Update or coast every existing track.
    this.tracks.forEach((track, ti) => {
      if (track.status === 'lost') return;
      const pair = pairs.get(ti);
      if (pair) {
        this.applyMeasurement(
          track,
          measurements[pair.mi].pos,
          measurements[pair.mi].plot.t,
          pair.d,
          scanPeriodSec
        );
        this.lastRange.set(track.id, measurements[pair.mi].plot.rangeNm);
      } else {
        this.coast(track, scanTime);
      }
    });

    // Anything unclaimed starts a new tentative track.
    for (const m of measurements) {
      if (m.claimed) continue;
      if (m.plot.rangeNm < this.cfg.minAcquireRangeNm) continue;
      this.tracks.push({
        id: this.nextId++,
        status: 'tentative',
        x: m.pos.x,
        y: m.pos.y,
        vx: 0,
        vy: 0,
        lastUpdate: m.plot.t,
        firstSeen: m.plot.t,
        hits: 1,
        misses: 0,
        trail: [{ x: m.pos.x, y: m.pos.y, t: m.plot.t }],
        initSamples: [{ x: m.pos.x, y: m.pos.y, t: m.plot.t }],
        residual: 0,
        residualAvg: 0,
        gainAge: 1,
        manoeuvreHold: 0,
        aisLock: 0,
      });
      this.lastRange.set(this.nextId - 1, m.plot.rangeNm);
    }

    // A filtered speed no ship could hold is association noise wearing a track's
    // clothing. Dropping it here stops a phantom from reaching the ARPA stage
    // and raising a collision alarm on nothing at all.
    const speedLimit = (this.cfg.maxTargetSpeedKn * 1.8) / 3600;
    for (const track of this.tracks) {
      if (track.hits > 2 && Math.hypot(track.vx, track.vy) > speedLimit) {
        track.status = 'lost';
      }
    }

    this.tracks = this.tracks.filter((t) => t.status !== 'lost');

    const live = new Set(this.tracks.map((t) => t.id));
    for (const id of this.lastRange.keys()) {
      if (!live.has(id)) this.lastRange.delete(id);
    }
  }

  private applyMeasurement(
    track: Track,
    pos: Vec2,
    t: number,
    residual: number,
    scanPeriodSec: number
  ): void {
    // Dead reckoning uses the real elapsed time, so the prediction is honest.
    const dt = Math.max(0, (t - track.lastUpdate) / 1000);

    // The velocity gain does NOT. Alpha-beta coefficients are derived for a
    // fixed sampling interval, and a target sitting near the sweep origin can
    // be measured twice within a fraction of a second when its bearing drifts
    // across the wrap. Dividing a pure-noise residual by that tiny interval
    // throws the velocity estimate into the hundreds of knots. Clamping the
    // gain interval to a window around the scan period keeps the filter
    // behaving the way its coefficients assume.
    const dtGain = Math.min(
      scanPeriodSec * 2,
      Math.max(scanPeriodSec * 0.5, dt || scanPeriodSec)
    );

    if (track.status === 'tentative') {
      track.initSamples.push({ x: pos.x, y: pos.y, t });
    }

    // Predict to the measurement time, then correct.
    const px = track.x + track.vx * dt;
    const py = track.y + track.vy * dt;
    const rx = pos.x - px;
    const ry = pos.y - py;

    // Manoeuvre detection. A settled track's residual is pure measurement
    // noise, so a residual several times its own running average means the
    // target has broken away from the predicted path. Winding the gain age
    // back reopens alpha and beta, and the filter catches up in a few scans
    // instead of the minutes the steady-state gains would take.
    const noiseFloor = Math.max(0.015, track.residualAvg);
    if (track.gainAge > 5 && residual > noiseFloor * this.cfg.manoeuvreThreshold) {
      track.gainAge = 2;
      track.manoeuvreHold = this.cfg.manoeuvreHoldScans;
    } else {
      track.gainAge += 1;
      if (track.manoeuvreHold > 0) track.manoeuvreHold -= 1;
    }
    track.residualAvg = track.residualAvg * 0.8 + residual * 0.2;

    // Bearing error converts to a cross-track position error proportional to
    // range, so a target at six miles is measured several times more coarsely
    // than one at one mile. Fixed alpha-beta gains assume constant measurement
    // noise, and holding them fixed here would put several knots of jitter on
    // every distant target's vector. Scaling the velocity gain floor down by
    // the track's own measured noise is the cheap stand-in for the
    // range-dependent gain a Kalman filter would derive.
    const noiseRatio = this.cfg.nominalNoiseNm / Math.max(track.residualAvg, this.cfg.nominalNoiseNm);
    const betaFloor = this.cfg.minBeta * Math.max(0.3, Math.min(1, noiseRatio));

    const { alpha, beta } = alphaBetaGains(track.gainAge, this.cfg.minAlpha, betaFloor);

    track.x = px + alpha * rx;
    track.y = py + alpha * ry;
    track.vx += (beta / dtGain) * rx;
    track.vy += (beta / dtGain) * ry;

    track.lastUpdate = t;
    track.hits += 1;
    track.misses = 0;
    track.residual = residual;

    track.trail.push({ x: track.x, y: track.y, t });
    if (track.trail.length > this.cfg.maxTrail) track.trail.shift();

    if (track.status === 'coasting') {
      track.status = 'confirmed';
    } else if (track.status === 'tentative' && track.hits >= this.cfg.confirmHits) {
      const sigma = measurementSigma(this.cfg, this.lastRange.get(track.id) ?? 1);
      track.status = isTrackConsistent(
        track.initSamples,
        sigma,
        this.cfg.straightnessSigmas
      )
        ? 'confirmed'
        : 'lost';
      track.initSamples = [];
    }
  }

  private coast(track: Track, t: number): void {
    const dt = Math.max(0, (t - track.lastUpdate) / 1000);
    track.x += track.vx * dt;
    track.y += track.vy * dt;
    track.lastUpdate = t;
    track.misses += 1;

    // A tentative track that misses even once is almost certainly clutter, so
    // it dies immediately. A confirmed track earns several scans of coasting.
    const status: TrackStatus =
      track.status === 'tentative'
        ? 'lost'
        : track.misses > this.cfg.maxMisses
          ? 'lost'
          : 'coasting';
    track.status = status;

    if (status === 'coasting') {
      track.trail.push({ x: track.x, y: track.y, t });
      if (track.trail.length > this.cfg.maxTrail) track.trail.shift();
    }
  }
}
