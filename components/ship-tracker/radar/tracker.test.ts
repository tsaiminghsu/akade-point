import { describe, expect, it } from 'vitest';

import { ShipTracker, alphaBetaGains, predict } from './tracker';
import { vecToPolar } from './geo';
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
        gainAge: 5, manoeuvreHold: 0, aisLock: 0,
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
