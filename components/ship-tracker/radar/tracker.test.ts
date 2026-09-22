import { describe, expect, it } from 'vitest';

import { ShipTracker, alphaBetaGains, predict } from './tracker';
import { polarToVec, vecToPolar } from './geo';
import { gaussian } from './radar';
import { mulberry32 } from './rng';
import type { RadarPlot, Vec2 } from './types';

const OWN: Vec2 = { x: 0, y: 0 };

/** Build a plot that would be produced by a target sitting at (x, y). */
function plotAt(x: number, y: number, t: number, id = `p${t}`): RadarPlot & { ownVec: Vec2 } {
  const { bearing, range } = vecToPolar({ x, y });
  return {
    id,
    t,
    rangeNm: range,
    bearing,
    strength: 1,
    widthDeg: 2,
    ownVec: OWN,
  };
}

describe('alphaBetaGains', () => {
  it('trusts the first measurement completely', () => {
    expect(alphaBetaGains(1, 0.1, 0.01).alpha).toBeCloseTo(1);
  });

  it('decays as the track matures', () => {
    const early = alphaBetaGains(2, 0.05, 0.01);
    const late = alphaBetaGains(10, 0.05, 0.01);
    expect(late.alpha).toBeLessThan(early.alpha);
    expect(late.beta).toBeLessThan(early.beta);
  });

  it('never falls below the floors that keep it manoeuvre-responsive', () => {
    const g = alphaBetaGains(500, 0.35, 0.08);
    expect(g.alpha).toBeCloseTo(0.35);
    expect(g.beta).toBeCloseTo(0.08);
  });
});

describe('predict', () => {
  it('dead-reckons a track forward at its filtered velocity', () => {
    const p = predict(
      {
        id: 1, status: 'confirmed', x: 1, y: 2,
        vx: 0.001, vy: -0.002, lastUpdate: 0, firstSeen: 0,
        hits: 5, misses: 0, trail: [], initSamples: [], residual: 0, residualAvg: 0,
        gainAge: 5, manoeuvreHold: 0, driftX: 0, driftY: 0, lastMeasured: 0, aisLock: 0,
      },
      2000
    );
    expect(p.x).toBeCloseTo(1.002);
    expect(p.y).toBeCloseTo(1.996);
  });
});

describe('ShipTracker', () => {
  it('promotes a consistent target to a confirmed track', () => {
    const tracker = new ShipTracker();
    for (let scan = 0; scan < 4; scan += 1) {
      tracker.update([plotAt(2, 3 + scan * 0.01, scan * 2500)], scan * 2500);
    }
    const tracks = tracker.getActiveTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].status).toBe('confirmed');
    expect(tracks[0].hits).toBe(4);
  });

  it('recovers a target velocity close to the truth', () => {
    const tracker = new ShipTracker();
    // 12 knots due north: 12/3600 NM per second, sampled every 2.5 s.
    const speed = 12 / 3600;
    for (let scan = 0; scan < 20; scan += 1) {
      const t = scan * 2500;
      tracker.update([plotAt(1, 2 + speed * (t / 1000), t)], t);
    }
    const track = tracker.getActiveTracks()[0];
    expect(track.vy * 3600).toBeCloseTo(12, 1);
    expect(track.vx * 3600).toBeCloseTo(0, 1);
  });

  it('drops a one-off clutter blip without ever confirming it', () => {
    const tracker = new ShipTracker();
    tracker.update([plotAt(0.4, 0.3, 0)], 0);
    expect(tracker.getActiveTracks()).toHaveLength(1);
    expect(tracker.getActiveTracks()[0].status).toBe('tentative');

    tracker.update([], 2500);
    expect(tracker.getActiveTracks()).toHaveLength(0);
  });

  it('coasts a confirmed track through a missed scan, then drops it', () => {
    const tracker = new ShipTracker();
    for (let scan = 0; scan < 5; scan += 1) {
      tracker.update([plotAt(2, 3, scan * 2500)], scan * 2500);
    }
    expect(tracker.getActiveTracks()[0].status).toBe('confirmed');

    tracker.update([], 5 * 2500);
    expect(tracker.getActiveTracks()[0].status).toBe('coasting');

    for (let scan = 6; scan < 12; scan += 1) tracker.update([], scan * 2500);
    expect(tracker.getActiveTracks()).toHaveLength(0);
  });

  it('keeps two crossing targets on separate tracks', () => {
    const tracker = new ShipTracker();
    const speed = 10 / 3600;
    for (let scan = 0; scan < 12; scan += 1) {
      const t = scan * 2500;
      const d = speed * (t / 1000);
      tracker.update(
        [
          plotAt(-2 + d, 3, t, `a${scan}`),
          plotAt(2 - d, 3.6, t, `b${scan}`),
        ],
        t
      );
    }
    const confirmed = tracker.getActiveTracks().filter((tr) => tr.status === 'confirmed');
    expect(confirmed).toHaveLength(2);
    // They run in opposite directions along x.
    const vx = confirmed.map((tr) => Math.sign(tr.vx)).sort();
    expect(vx).toEqual([-1, 1]);
  });

  it('reacquires rather than jumping when a target teleports beyond the gate', () => {
    const tracker = new ShipTracker();
    for (let scan = 0; scan < 5; scan += 1) {
      tracker.update([plotAt(2, 3, scan * 2500)], scan * 2500);
    }
    const originalId = tracker.getActiveTracks()[0].id;

    // A plot far outside any plausible gate must start a new track.
    tracker.update([plotAt(-3, -4, 5 * 2500)], 5 * 2500);
    const ids = tracker.getActiveTracks().map((t) => t.id);
    expect(ids).toContain(originalId);
    expect(ids.length).toBe(2);
  });

  it('resets to an empty picture', () => {
    const tracker = new ShipTracker();
    tracker.update([plotAt(1, 1, 0)], 0);
    tracker.reset();
    expect(tracker.getActiveTracks()).toHaveLength(0);
  });
});

// ── Association under stress ──────────────────────────────────────

/** A plot for a target at (x, y), with the sensor's real noise on it. */
function noisyPlot(
  x: number,
  y: number,
  t: number,
  rand: () => number,
  id: string
): RadarPlot & { ownVec: Vec2 } {
  const { bearing, range } = vecToPolar({ x, y });
  return {
    id,
    t,
    rangeNm: range + gaussian(rand) * 0.012,
    bearing: bearing + gaussian(rand) * 0.35,
    strength: 1,
    widthDeg: 2,
    ownVec: OWN,
  };
}

function nearest(tracker: ShipTracker, x: number, y: number) {
  return tracker
    .getActiveTracks()
    .filter((t) => t.status !== 'tentative')
    .map((t) => ({ t, d: Math.hypot(t.x - x, t.y - y) }))
    .sort((a, b) => a.d - b.d)[0];
}

describe('ShipTracker association under stress', () => {
  const T = 2500;

  it('does not let one stray echo throw a settled vector', () => {
    // The fault behind most stray tracks: a single ordinary outlier reset the
    // filter to its start-up gains and added about seventy knots to a steady
    // ten-knot ship.
    const tracker = new ShipTracker();
    const speed = 10 / 3600;
    for (let scan = 0; scan < 40; scan += 1) {
      const t = scan * T;
      tracker.update([plotAt(2, 3 + speed * (t / 1000), t)], t);
    }
    const t = 40 * T;
    tracker.update([plotAt(2.05, 3 + speed * (t / 1000), t)], t);

    const tracks = tracker.getActiveTracks();
    expect(tracks).toHaveLength(1);
    expect(Math.hypot(tracks[0].vx, tracks[0].vy) * 3600).toBeCloseTo(10, 0);
    expect(Math.abs(tracks[0].vx) * 3600).toBeLessThan(3);
  });

  it('carries two ships through a close crossing on their own tracks', () => {
    // The harbour-entrance case: two vessels on reciprocal courses passing a
    // few metres apart, closer than the measurement noise. Which track takes
    // which echo at the crossing is a coin toss; what matters is that each
    // track comes out the far side still on its own ship.
    const rand = mulberry32(2024);
    const tracker = new ShipTracker();
    const east = 7 / 3600;
    const west = 6.5 / 3600;
    const at = (scan: number) => {
      const s = (scan * T) / 1000;
      return { a: { x: -0.35 + east * s, y: 2 }, b: { x: 0.35 - west * s, y: 2.003 } };
    };

    let idA = -1;
    let idB = -1;
    for (let scan = 0; scan < 170; scan += 1) {
      const t = scan * T;
      const { a, b } = at(scan);
      tracker.update(
        [noisyPlot(a.x, a.y, t, rand, `a${scan}`), noisyPlot(b.x, b.y, t, rand, `b${scan}`)],
        t
      );
      if (scan === 50) {
        idA = nearest(tracker, a.x, a.y).t.id;
        idB = nearest(tracker, b.x, b.y).t.id;
      }
    }

    expect(idA).not.toBe(idB);
    const { a, b } = at(169);
    const trackA = tracker.getActiveTracks().find((t) => t.id === idA);
    const trackB = tracker.getActiveTracks().find((t) => t.id === idB);
    expect(trackA).toBeDefined();
    expect(trackB).toBeDefined();
    expect(Math.hypot(trackA!.x - a.x, trackA!.y - a.y)).toBeLessThan(0.1);
    expect(Math.hypot(trackB!.x - b.x, trackB!.y - b.y)).toBeLessThan(0.1);
    expect(trackA!.vx).toBeGreaterThan(0);
    expect(trackB!.vx).toBeLessThan(0);
  });

  it('keeps a hard-turning boat on its track instead of starting a new one', () => {
    // The pilot boat case: a hard turn makes the filter lag, and the echo lands
    // just outside a gate sized for straight running. It used to start a fresh
    // track that then won every echo while the old one coasted away. A fast
    // boat turning at 120 deg/min makes the lag large enough to happen on
    // every run rather than on an unlucky noise draw.
    const rand = mulberry32(11);
    const tracker = new ShipTracker();
    const speed = 25 / 3600;
    let x = 0.2;
    let y = 0.5;
    let course = 0;
    let firstId = -1;
    for (let scan = 0; scan < 110; scan += 1) {
      const t = scan * T;
      if (scan >= 40 && scan < 70) course += 5; // 120 degrees a minute
      const step = polarToVec(course, speed * (T / 1000));
      x += step.x;
      y += step.y;
      tracker.update([noisyPlot(x, y, t, rand, `p${scan}`)], t);
      if (scan === 30) firstId = nearest(tracker, x, y).t.id;
    }

    const established = tracker.getActiveTracks().filter((t) => t.status !== 'tentative');
    expect(established.map((t) => t.id)).toEqual([firstId]);
  });

  it('widens the gate for a track that has gone unobserved for a while', () => {
    // Coasting advanced the position but used to reset the clock the gate grew
    // on, so a track that had missed three scans still had a one-scan gate.
    const tracker = new ShipTracker();
    const speed = 12 / 3600;
    for (let scan = 0; scan < 20; scan += 1) {
      const t = scan * T;
      tracker.update([plotAt(2, speed * (t / 1000), t)], t);
    }
    const id = tracker.getActiveTracks()[0].id;
    for (let scan = 20; scan < 23; scan += 1) tracker.update([], scan * T);

    // Beyond a one-scan gate at this range, inside a gate grown over 10 s.
    const t = 23 * T;
    tracker.update([plotAt(2.078, speed * (t / 1000), t)], t);

    const tracks = tracker.getActiveTracks();
    expect(tracks.map((tr) => tr.id)).toEqual([id]);
    expect(tracks[0].status).toBe('confirmed');
  });

  it('never flags a ship holding a steady course', () => {
    const rand = mulberry32(5);
    const tracker = new ShipTracker();
    const speed = 10 / 3600;
    let flagged = 0;
    for (let scan = 0; scan < 400; scan += 1) {
      const t = scan * T;
      tracker.update([noisyPlot(1.5, 1 + speed * (t / 1000), t, rand, `p${scan}`)], t);
      const track = tracker.getActiveTracks()[0];
      if (track && track.manoeuvreHold > 0) flagged += 1;
    }
    expect(flagged).toBe(0);
  });

  it('flags a ship that puts her helm hard over', () => {
    const rand = mulberry32(5);
    const tracker = new ShipTracker();
    const speed = 16 / 3600;
    let x = 1.2;
    let y = 0.5;
    let course = 0;
    let flagged = false;
    for (let scan = 0; scan < 110; scan += 1) {
      const t = scan * T;
      if (scan >= 60) course += 3.75; // 90 degrees a minute
      const step = polarToVec(course, speed * (T / 1000));
      x += step.x;
      y += step.y;
      tracker.update([noisyPlot(x, y, t, rand, `p${scan}`)], t);
      if (scan >= 60 && tracker.getActiveTracks().some((tr) => tr.manoeuvreHold > 0)) {
        flagged = true;
      }
    }
    expect(flagged).toBe(true);
  });
});
