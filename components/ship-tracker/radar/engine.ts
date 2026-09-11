/**
 * Radar engine: the loop that ties the pieces together.
 *
 * Per frame it advances the world, rotates the antenna, and collects whatever
 * echoes the beam produced. Per antenna revolution it runs the tracker, fuses
 * AIS identities onto the tracks, and recomputes the ARPA solution. That split
 * is not an optimisation — it is how the real thing works. Association is only
 * well posed once you have a full scan, so tracks update at the scan rate while
 * the picture paints continuously.
 */

import { mulberry32 } from './rng';
import {
  bearingDelta,
  haversineNm,
  initialBearing,
  knotsToNmPerSec,
  normalizeDeg,
  polarToVec,
  toLocalPlane,
} from './geo';
import { DEFAULT_ENVIRONMENT, DEFAULT_SENSOR, sweep, sweptThrough } from './radar';
import type { Environment, RadarSensor } from './radar';
import { ShipTracker } from './tracker';
import {
  COASTLINE,
  DEFAULT_OWN_SHIP,
  SCENE_ORIGIN,
  collectAisReports,
  createFleet,
  isLineOfSightBlocked,
  stepFleet,
  stepOwnShip,
} from './world';
import { buildAisOnlyTarget, buildTarget } from './arpa';
import type {
  AisReport,
  ArpaTarget,
  DataSource,
  LatLon,
  OwnShip,
  RadarConfig,
  RadarPlot,
  RadarSnapshot,
  Track,
  Vec2,
  Vessel,
} from './types';

export const DEFAULT_CONFIG: RadarConfig = {
  rangeNm: 6,
  sweepRpm: 24,
  orientation: 'north-up',
  motionMode: 'relative',
  vectorMinutes: 6,
  trailMinutes: 3,
  gain: 0.55,
  seaClutter: 0.35,
  rainClutter: 0.2,
  guardZone: {
    enabled: true,
    innerNm: 0.5,
    outerNm: 2.5,
    startRelBearing: 315,
    endRelBearing: 45,
  },
  cpaLimitNm: 0.5,
  tcpaLimitMin: 12,
  showAisOverlay: true,
  showTrails: true,
  showVectors: true,
  showTruth: false,
};

/** Range scales a real set offers, in NM. */
export const RANGE_SCALES = [0.75, 1.5, 3, 6, 12, 24];

/**
 * Fixed simulation step. Everything downstream — the motion model, the sweep,
 * the clutter rate — is written as a rate per second, and stepping at a fixed
 * interval is what makes those rates hold whether the display is running at
 * 144 fps or has been throttled to one frame a second in a background tab.
 */
const FIXED_STEP_SEC = 1 / 60;

/**
 * Most wall-clock time one call will try to make up. A tab that has been
 * backgrounded for ten minutes must not come back and simulate ten minutes in
 * one frame, but a display that briefly drops to a few frames a second should
 * keep real time rather than sliding into slow motion.
 */
const MAX_CATCHUP_SEC = 1.5;

/**
 * Simulated seconds run before the first frame is drawn.
 *
 * A track needs three scans to be confirmed and a good deal longer for its
 * velocity to settle, so a cold start would show the operator an empty screen
 * and then a minute of half-formed tracks. A real set has been running long
 * before anyone walks up to it, and this is what makes the display open the
 * same way. Ninety seconds of simulation costs about a tenth of a second.
 */
const DEFAULT_WARMUP_SEC = 90;

/** AIS receiver range. VHF bends around land, which radar does not. */
const AIS_RANGE_NM = 20;

interface LandSample {
  pos: LatLon;
  bearing: number;
  rangeNm: number;
}

export class RadarEngine {
  private vessels: Vessel[];
  private own: OwnShip;
  private tracker = new ShipTracker();
  private rand: () => number;

  private config: RadarConfig = { ...DEFAULT_CONFIG };
  private sensor: RadarSensor = { ...DEFAULT_SENSOR };
  private env: Environment = { ...DEFAULT_ENVIRONMENT };
  private source: DataSource = 'simulation';

  private t: number;
  private sweepAngle = 0;
  private scanCount = 0;
  /** Unspent wall-clock time carried between calls to `step`. */
  private accumulator = 0;
  /** Simulated seconds advanced by the most recent `step`. */
  private advancedSec = 0;

  /** Plots waiting for the end of the revolution, with own ship's position. */
  private pendingPlots: Array<RadarPlot & { ownVec: Vec2 }> = [];
  /** Plots produced this frame, handed to the renderer then cleared. */
  private framePlots: RadarPlot[] = [];

  private ais = new Map<string, AisReport>();
  private targets: ArpaTarget[] = [];

  private landPoints: LatLon[] = [];
  private landSamples: LandSample[] = [];
  private landRefreshedAt = 0;

  constructor(now = Date.now(), seed = 0x5eed_1234, warmupSec = DEFAULT_WARMUP_SEC) {
    this.t = now;
    this.rand = mulberry32(seed);
    this.vessels = createFleet(now, this.rand);
    this.own = { ...DEFAULT_OWN_SHIP, pos: { ...DEFAULT_OWN_SHIP.pos } };
    // Spacing chosen so the sampled points overlap into a continuous shoreline
    // at the ranges the scope is normally used at, rather than a dotted line.
    this.landPoints = sampleCoastline(0.03);
    this.refreshLandSamples();
    this.warmUp(warmupSec);
  }

  /**
   * Run the simulation forward without painting, so the display opens on an
   * established picture. Echoes are discarded because they belong to sweeps
   * nobody saw.
   */
  private warmUp(seconds: number): void {
    const steps = Math.round(Math.max(0, seconds) / FIXED_STEP_SEC);
    for (let i = 0; i < steps; i += 1) this.advance(FIXED_STEP_SEC);
    this.framePlots = [];
  }

  // ── Accessors ───────────────────────────────────────────────────

  getConfig(): RadarConfig {
    return this.config;
  }

  setConfig(patch: Partial<RadarConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  getEnvironment(): Environment {
    return this.env;
  }

  setEnvironment(patch: Partial<Environment>): void {
    this.env = { ...this.env, ...patch };
  }

  getOwnShip(): OwnShip {
    return this.own;
  }

  setOrdered(course?: number, speed?: number): void {
    if (course !== undefined) this.own.orderedCourse = normalizeDeg(course);
    if (speed !== undefined) this.own.orderedSpeed = Math.max(0, Math.min(30, speed));
  }

  getSource(): DataSource {
    return this.source;
  }

  setSource(source: DataSource): void {
    if (source === this.source) return;
    this.source = source;
    this.tracker.reset();
    this.ais.clear();
    this.targets = [];
    this.pendingPlots = [];
    if (source === 'simulation') this.vessels = createFleet(this.t, this.rand);
    else this.vessels = [];
  }

  getVessels(): Vessel[] {
    return this.vessels;
  }

  getTracks(): Track[] {
    return this.tracker.getActiveTracks();
  }

  reset(now = Date.now()): void {
    this.t = now;
    this.tracker.reset();
    this.ais.clear();
    this.targets = [];
    this.pendingPlots = [];
    this.framePlots = [];
    this.sweepAngle = 0;
    this.scanCount = 0;
    this.accumulator = 0;
    this.own = { ...DEFAULT_OWN_SHIP, pos: { ...DEFAULT_OWN_SHIP.pos } };
    if (this.source === 'simulation') this.vessels = createFleet(now, this.rand);
    this.refreshLandSamples();
  }

  /**
   * Feed AIS reports from a live receiver.
   *
   * Each report becomes or updates a vessel, so the radar model still has
   * something physical to bounce off: live mode swaps out where the positions
   * come from, not how the sensor behaves.
   */
  ingestLiveAis(reports: AisReport[]): void {
    for (const r of reports) {
      this.ais.set(r.mmsi, r);
      const existing = this.vessels.find((v) => v.mmsi === r.mmsi);
      if (existing) {
        existing.pos = { lat: r.lat, lon: r.lon };
        existing.cog = r.cog;
        existing.sog = r.sog;
        existing.cruiseSog = r.sog;
        existing.heading = r.heading;
        existing.navStatus = r.navStatus;
        existing.lastAisTx = r.t;
      } else {
        this.vessels.push({
          mmsi: r.mmsi,
          name: r.name,
          kind: r.kind,
          lengthM: r.lengthM,
          pos: { lat: r.lat, lon: r.lon },
          cog: r.cog,
          sog: r.sog,
          heading: r.heading,
          rot: 0,
          navStatus: r.navStatus,
          destination: r.destination,
          rcs: 0.5 + Math.min(1, r.lengthM / 200) * 0.5,
          aisEnabled: true,
          route: [],
          legIndex: 0,
          cruiseSog: r.sog,
          swingPhase: 0,
          lastAisTx: r.t,
        });
      }
    }

    // Drop anything that has gone quiet for five minutes.
    const cutoff = this.t - 300_000;
    this.vessels = this.vessels.filter((v) => v.lastAisTx > cutoff);
    for (const [mmsi, report] of this.ais) {
      if (report.t < cutoff) this.ais.delete(mmsi);
    }
  }

  // ── Main loop ───────────────────────────────────────────────────

  step(dtMs: number): void {
    this.accumulator += Math.min(MAX_CATCHUP_SEC, Math.max(0, dtMs / 1000));

    // Echoes are collected across every sub-step so a slow frame still paints
    // the whole arc the antenna covered, not just its last sixtieth of a second.
    this.framePlots = [];
    this.advancedSec = 0;

    while (this.accumulator >= FIXED_STEP_SEC) {
      this.accumulator -= FIXED_STEP_SEC;
      this.advance(FIXED_STEP_SEC);
      this.advancedSec += FIXED_STEP_SEC;
    }
  }

  private advance(dtSec: number): void {
    this.t += dtSec * 1000;

    stepOwnShip(this.own, dtSec);
    stepFleet(this.vessels, dtSec, this.rand);

    if (this.source === 'simulation') {
      for (const r of collectAisReports(this.vessels, this.t)) this.ais.set(r.mmsi, r);
    }

    if (this.t - this.landRefreshedAt > 400) this.refreshLandSamples();

    this.advanceSweep(dtSec);
  }

  private advanceSweep(dtSec: number): void {
    const degPerSec = (this.config.sweepRpm * 360) / 60;
    const prev = this.sweepAngle;
    const next = prev + degPerSec * dtSec;
    const wrapped = normalizeDeg(next);

    const ownVec = toLocalPlane(SCENE_ORIGIN, this.own.pos);

    // Only vessels the radar can actually see: in range, and not behind land.
    const visible = this.vessels.filter((v) => {
      const range = haversineNm(this.own.pos, v.pos);
      if (range < this.sensor.minRangeNm || range > this.sensor.maxRangeNm) return false;
      return !isLineOfSightBlocked(this.own.pos, v.pos);
    });

    const { plots } = sweep(
      prev,
      next,
      this.own.pos,
      this.own,
      visible,
      this.config,
      this.sensor,
      this.env,
      this.t,
      this.rand
    );

    for (const p of plots) {
      this.framePlots.push(p);
      this.pendingPlots.push({ ...p, ownVec });
    }

    // Land paints on the scope but is kept out of the tracker, the way an
    // operator excludes a charted coastline from acquisition.
    for (const s of this.landSamples) {
      if (!sweptThrough(prev, next, s.bearing)) continue;
      if (s.rangeNm > this.config.rangeNm * 1.05) continue;
      this.framePlots.push({
        id: `l${s.bearing.toFixed(2)}_${s.rangeNm.toFixed(3)}`,
        t: this.t,
        rangeNm: s.rangeNm,
        bearing: s.bearing,
        strength: 0.9,
        widthDeg: this.sensor.beamWidthDeg,
      });
    }

    this.sweepAngle = wrapped;

    if (next >= 360) {
      this.scanCount += 1;
      this.completeScan();
    }
  }

  /** End of a revolution: update tracks, fuse identities, recompute ARPA. */
  private completeScan(): void {
    this.tracker.update(this.pendingPlots, this.t, 60 / this.config.sweepRpm);
    this.pendingPlots = [];
    this.fuseAis();
    this.buildTargets();
  }

  /**
   * Associate AIS reports with radar tracks.
   *
   * A report has to agree with a track on position and, when both are moving,
   * on course and speed. An existing association gets a looser gate so an
   * identity does not flicker off during a turn, which is the failure everyone
   * notices.
   */
  private fuseAis(): void {
    const tracks = this.tracker.getActiveTracks().filter((t) => t.status !== 'tentative');
    const reports = [...this.ais.values()].filter((r) => this.t - r.t < 60_000);

    const positions = new Map<string, Vec2>();
    for (const r of reports) {
      positions.set(r.mmsi, toLocalPlane(SCENE_ORIGIN, { lat: r.lat, lon: r.lon }));
    }

    const scored: Array<{ track: Track; report: AisReport; score: number }> = [];
    for (const track of tracks) {
      const trackSpeed = Math.hypot(track.vx, track.vy) * 3600;
      const trackCourse = normalizeDeg((Math.atan2(track.vx, track.vy) * 180) / Math.PI);

      for (const report of reports) {
        const p = positions.get(report.mmsi)!;
        const d = Math.hypot(p.x - track.x, p.y - track.y);
        const sticky = track.aisMmsi === report.mmsi;
        const gate = sticky ? 0.45 : 0.25;
        if (d > gate) continue;

        const speedDiff = Math.abs(report.sog - trackSpeed);
        if (speedDiff > (sticky ? 7 : 4.5)) continue;

        if (report.sog > 1.5 && trackSpeed > 1.5) {
          const courseDiff = Math.abs(bearingDelta(report.cog, trackCourse));
          if (courseDiff > (sticky ? 55 : 35)) continue;
        }

        scored.push({
          track,
          report,
          score: d + speedDiff * 0.02 - (sticky ? 0.2 : 0),
        });
      }
    }

    scored.sort((a, b) => a.score - b.score);
    const usedTracks = new Set<number>();
    const usedMmsi = new Set<string>();
    const assigned = new Map<number, string>();

    for (const s of scored) {
      if (usedTracks.has(s.track.id) || usedMmsi.has(s.report.mmsi)) continue;
      usedTracks.add(s.track.id);
      usedMmsi.add(s.report.mmsi);
      assigned.set(s.track.id, s.report.mmsi);
    }

    for (const track of this.tracker.getActiveTracks()) {
      const mmsi = assigned.get(track.id);
      if (mmsi) {
        track.aisLock = track.aisMmsi === mmsi ? track.aisLock + 1 : 1;
        track.aisMmsi = mmsi;
      } else if (track.aisMmsi) {
        // Hold a lost identity for a few scans before letting it go.
        track.aisLock -= 1;
        if (track.aisLock <= -3) {
          track.aisMmsi = undefined;
          track.aisLock = 0;
        }
      }
    }
  }

  private buildTargets(): void {
    const ownVec = toLocalPlane(SCENE_ORIGIN, this.own.pos);
    const tracks = this.tracker.getActiveTracks();

    const targets = tracks.map((track) =>
      buildTarget(
        track,
        ownVec,
        this.own,
        this.config,
        track.aisMmsi ? this.ais.get(track.aisMmsi) : undefined
      )
    );

    // AIS contacts with no radar track behind them: masked by land, too small,
    // or lost in clutter. They still matter, so they get a symbol of their own.
    if (this.config.showAisOverlay) {
      const trackedMmsi = new Set(tracks.map((t) => t.aisMmsi).filter(Boolean) as string[]);
      let syntheticId = -1;
      for (const report of this.ais.values()) {
        if (trackedMmsi.has(report.mmsi)) continue;
        if (this.t - report.t > 240_000) continue;
        const pos = { lat: report.lat, lon: report.lon };
        if (haversineNm(this.own.pos, pos) > AIS_RANGE_NM) continue;
        targets.push(
          buildAisOnlyTarget(
            report,
            toLocalPlane(SCENE_ORIGIN, pos),
            ownVec,
            this.own,
            this.config,
            syntheticId
          )
        );
        syntheticId -= 1;
      }
    }

    targets.sort((a, b) => a.rangeNm - b.rangeNm);
    this.targets = targets;
  }

  private refreshLandSamples(): void {
    this.landRefreshedAt = this.t;
    const maxRange = this.sensor.maxRangeNm;
    this.landSamples = [];
    for (const pos of this.landPoints) {
      const rangeNm = haversineNm(this.own.pos, pos);
      if (rangeNm > maxRange) continue;
      this.landSamples.push({ pos, rangeNm, bearing: initialBearing(this.own.pos, pos) });
    }
  }

  // ── Output ──────────────────────────────────────────────────────

  snapshot(): RadarSnapshot {
    const ownVec = toLocalPlane(SCENE_ORIGIN, this.own.pos);
    const inScope = this.targets.filter((t) => t.rangeNm <= this.config.rangeNm * 1.02);

    return {
      t: this.t,
      advancedSec: this.advancedSec,
      own: this.own,
      ownVec,
      targets: inScope,
      plots: this.framePlots,
      sweepAngle: this.sweepAngle,
      scanCount: this.scanCount,
      alarms: inScope.filter((t) => t.danger === 'danger'),
      guardAlarms: inScope.filter((t) => t.inGuardZone && t.status === 'confirmed'),
    };
  }

  /** Where own ship will be in `minutes`, for drawing its own vector. */
  ownVector(minutes: number): Vec2 {
    return polarToVec(this.own.cog, knotsToNmPerSec(this.own.sog) * minutes * 60);
  }
}

/** Break the coastline polylines into points spaced `stepNm` apart. */
export function sampleCoastline(stepNm: number, coast = COASTLINE): LatLon[] {
  const out: LatLon[] = [];
  for (const line of coast) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i];
      const b = line[i + 1];
      const len = haversineNm(a, b);
      const steps = Math.max(1, Math.ceil(len / stepNm));
      for (let s = 0; s < steps; s += 1) {
        const f = s / steps;
        out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
      }
    }
    out.push(line[line.length - 1]);
  }
  return out;
}
