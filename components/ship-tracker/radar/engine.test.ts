import { describe, expect, it } from 'vitest';

import { mulberry32 } from './rng';
import { RadarEngine, DEFAULT_CONFIG } from './engine';
import { DEFAULT_SENSOR, sweep } from './radar';
import { DEFAULT_OWN_SHIP, SCENE_ORIGIN, createFleet } from './world';
import { bearingDelta, haversineNm, polarToVec, toLocalPlane } from './geo';

/** Fixed seed so every scenario in this file is reproducible. */
const SEED = 0x5eed_1234;

/** Drive the engine forward in realistic animation-frame slices. */
function run(engine: RadarEngine, seconds: number, stepMs = 50): void {
  const steps = Math.round((seconds * 1000) / stepMs);
  for (let i = 0; i < steps; i += 1) engine.step(stepMs);
}

describe('sweep clutter', () => {
  const oneScan = (seaClutter: number, seaState: number) => {
    const rand = mulberry32(99);
    const { plots } = sweep(
      0,
      359.9,
      DEFAULT_OWN_SHIP.pos,
      DEFAULT_OWN_SHIP,
      [],
      { ...DEFAULT_CONFIG, seaClutter },
      DEFAULT_SENSOR,
      { seaState, rainRate: 0 },
      0,
      rand
    );
    return plots.length;
  };

  it('paints clutter in a rising sea even with no vessels present', () => {
    expect(oneScan(0, 5)).toBeGreaterThan(10);
  });

  it('clears most of it once the STC is applied', () => {
    expect(oneScan(0.9, 5)).toBeLessThan(oneScan(0, 5) / 2);
  });

  it('shows a flat calm as an empty screen', () => {
    expect(oneScan(0.35, 0)).toBe(0);
  });
});

describe('RadarEngine', () => {
  it('acquires and confirms traffic within a few antenna revolutions', () => {
    const engine = new RadarEngine(0, SEED, 0);
    // 24 rpm is one revolution every 2.5 s; give it enough scans to confirm.
    run(engine, 30);

    const snap = engine.snapshot();
    expect(snap.scanCount).toBeGreaterThanOrEqual(10);

    const radarTargets = snap.targets.filter((t) => !t.aisOnly);
    expect(radarTargets.length).toBeGreaterThan(3);
    expect(radarTargets.some((t) => t.status === 'confirmed')).toBe(true);
  });

  it('measures course and speed accurately once a target has settled', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 90);

    // Note which vessels are steering a steady course, then let them run on.
    // An alpha-beta filter lags a turn by design, so only settled targets can
    // be held to a tight tolerance.
    const before = new Map(engine.getVessels().map((v) => [v.mmsi, v.cog]));
    run(engine, 60);

    const truth = new Map(engine.getVessels().map((v) => [v.mmsi, v]));
    const settled = engine
      .snapshot()
      .targets.filter((t) => !t.aisOnly && t.status === 'confirmed' && t.ais)
      .map((t) => ({ target: t, vessel: truth.get(t.ais!.mmsi)! }))
      .filter(
        (m) =>
          m.vessel &&
          m.vessel.sog > 4 &&
          Math.abs(bearingDelta(before.get(m.vessel.mmsi) ?? 0, m.vessel.cog)) < 3
      );

    expect(settled.length).toBeGreaterThan(2);

    // Judge the velocity vector, not course and speed separately. A knot of
    // vector error is nine degrees of course on a six-knot fishing boat and
    // three on an eighteen-knot ship, so a fixed course tolerance would be
    // either meaningless for one or unfair to the other.
    //
    // And judge it across the fleet. The estimate is a filtered measurement,
    // so its error is a distribution: the average is what says the filter is
    // tuned, while the worst case only bounds the tail.
    const errors = settled.map((m) => {
      const truthVel = polarToVec(m.vessel.cog, m.vessel.sog);
      const trackedVel = polarToVec(m.target.cog, m.target.sog);
      return Math.hypot(trackedVel.x - truthVel.x, trackedVel.y - truthVel.y);
    });
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;

    // Bearing noise dominates, and it converts to a cross-track position error
    // proportional to range: a third of a degree is 18 m at 3 NM but 30 m at 5.
    // The gain floor adapts to that, but it cannot erase it, so the worst
    // target on the screen is always the furthest one. Tightening this bound
    // would mean claiming an accuracy the sensor model does not support.
    expect(mean).toBeLessThan(1.6);
    expect(Math.max(...errors)).toBeLessThan(3);
  });

  it('flags a target as manoeuvring while it is under helm', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 200);

    // The fishing fleet works its ground on a continuous slow weave, so at any
    // moment some track should be caught breaking away from its prediction.
    const seen = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      run(engine, 5);
      for (const t of engine.snapshot().targets) {
        if (t.manoeuvring) seen.add(t.trackId);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('puts an identity on most confirmed tracks but leaves dark vessels unnamed', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 90);

    const confirmed = engine
      .snapshot()
      .targets.filter((t) => !t.aisOnly && t.status === 'confirmed');
    expect(confirmed.length).toBeGreaterThan(3);

    const named = confirmed.filter((t) => t.ais).length;
    expect(named).toBeGreaterThan(confirmed.length * 0.4);
  });

  it('never fuses an AIS identity onto a vessel that transmits nothing', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 120);

    const dark = engine.getVessels().filter((v) => !v.aisEnabled).map((v) => v.mmsi);
    expect(dark.length).toBeGreaterThan(0);

    const claimed = engine.snapshot().targets.map((t) => t.ais?.mmsi).filter(Boolean);
    for (const mmsi of dark) expect(claimed).not.toContain(mmsi);
  });

  it('reports harbour vessels behind land on AIS alone', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 60);

    const aisOnly = engine.snapshot().targets.filter((t) => t.aisOnly);
    expect(aisOnly.length).toBeGreaterThan(0);
    // Everything masked by Cijin is moored inside the harbour.
    expect(aisOnly.some((t) => t.ais?.navStatus === 'moored')).toBe(true);
  });

  it('raises a collision warning on the vessel set to cross own ship', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 120);

    const snap = engine.snapshot();
    const flagged = snap.targets.filter(
      (t) => t.danger !== 'safe' || t.cpaNm < DEFAULT_CONFIG.cpaLimitNm
    );
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('lets a bold alteration of course open the CPA back up', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 120);

    const before = Math.min(
      ...engine
        .snapshot()
        .targets.filter((t) => t.status === 'confirmed' && t.tcpaSec > 0)
        .map((t) => t.cpaNm)
    );

    // Hard to port and slow down, the standard response to a close quarters
    // situation developing ahead.
    engine.setOrdered(340, 4);
    run(engine, 180);

    const after = Math.min(
      ...engine
        .snapshot()
        .targets.filter((t) => t.status === 'confirmed' && t.tcpaSec > 0)
        .map((t) => t.cpaNm)
    );

    expect(after).toBeGreaterThan(before);
  });

  it('keeps own ship moving on its ordered course', () => {
    const engine = new RadarEngine(0, SEED, 0);
    const start = { ...engine.getOwnShip().pos };
    run(engine, 60);
    const own = engine.getOwnShip();

    expect(own.heading).toBeCloseTo(DEFAULT_OWN_SHIP.orderedCourse, 1);
    // 8 knots for a minute is roughly 0.13 NM.
    expect(haversineNm(start, own.pos)).toBeCloseTo(8 / 60, 1);
  });

  it('drops every track and rebuilds the fleet on reset', () => {
    const engine = new RadarEngine(0, SEED, 0);
    run(engine, 40);
    expect(engine.getTracks().length).toBeGreaterThan(0);

    engine.reset(0);
    expect(engine.getTracks()).toHaveLength(0);
    expect(engine.snapshot().targets).toHaveLength(0);
    expect(engine.getVessels().length).toBe(createFleet(0).length);
  });

  it('does not promote sea clutter into phantom targets', () => {
    // Clutter blips are dense close in and uncorrelated between scans, so a
    // gate that stays wide at short range will chain them into confirmed tracks
    // with invented courses, and those tracks then raise collision alarms on
    // nothing. Rough weather with the anti-clutter control backed off is the
    // worst case for it.
    const engine = new RadarEngine(0, SEED, 0);
    engine.setEnvironment({ seaState: 5 });
    engine.setConfig({ seaClutter: 0.1, gain: 0.75 });
    run(engine, 240);

    const vessels = engine.getVessels();
    const phantoms = engine
      .snapshot()
      .targets.filter((t) => !t.aisOnly && t.status === 'confirmed')
      .filter((t) =>
        // A real track sits on top of a real ship. Anything far from every
        // vessel in the world was invented by the tracker.
        vessels.every((v) => {
          const p = toLocalPlane(SCENE_ORIGIN, v.pos);
          return Math.hypot(p.x - t.x, p.y - t.y) > 0.25;
        })
      );

    expect(phantoms).toHaveLength(0);
  });

  it('still finds the real traffic through that clutter', () => {
    const engine = new RadarEngine(0, SEED, 0);
    engine.setEnvironment({ seaState: 5 });
    engine.setConfig({ seaClutter: 0.1, gain: 0.75 });
    run(engine, 240);

    const confirmed = engine
      .snapshot()
      .targets.filter((t) => !t.aisOnly && t.status === 'confirmed');
    expect(confirmed.length).toBeGreaterThan(5);
  });

  it('opens on an established picture rather than an empty screen', () => {
    // Warm-up is what the operator actually sees on load, so it has to have
    // produced confirmed tracks before the first frame is ever drawn.
    const engine = new RadarEngine(0);
    const targets = engine.snapshot().targets;
    expect(targets.filter((t) => !t.aisOnly && t.status === 'confirmed').length)
      .toBeGreaterThan(3);
    expect(engine.snapshot().plots).toHaveLength(0);
  });

  it('survives a long stall without teleporting the fleet', () => {
    const engine = new RadarEngine(0, SEED, 0);
    const before = engine.getOwnShip().pos.lat;
    // A backgrounded tab hands back one enormous delta.
    engine.step(600_000);
    const moved = Math.abs(engine.getOwnShip().pos.lat - before);
    // Catch-up is bounded, so own ship advances a second or so, not ten minutes.
    expect(moved).toBeLessThan(0.001);
  });

  it('keeps real time through a badly throttled frame rate', () => {
    // A backgrounded tab is often held to one frame a second. The simulation
    // has to make that time up in sub-steps, or the whole picture quietly runs
    // in slow motion: the antenna turns slower, targets crawl, and the CPA
    // solution is computed against a clock that no longer matches the world.
    const smooth = new RadarEngine(0, SEED, 0);
    for (let i = 0; i < 600; i += 1) smooth.step(1000 / 60);

    const throttled = new RadarEngine(0, SEED, 0);
    for (let i = 0; i < 10; i += 1) throttled.step(1000);

    expect(throttled.snapshot().scanCount).toBe(smooth.snapshot().scanCount);
    expect(throttled.getOwnShip().pos.lat).toBeCloseTo(smooth.getOwnShip().pos.lat, 5);
    expect(throttled.getOwnShip().pos.lon).toBeCloseTo(smooth.getOwnShip().pos.lon, 5);
  });
});
