import { describe, it, expect } from 'vitest';
import { Cadence, SIM_HZ, decay, frameScale } from '../timestep';
import { moveVehicleTowardWaypoint } from '../traffic';
import { steerDirect } from '../police';
import { createFrameGate } from '../frameGate';
import { Vehicle, VehicleType } from '../types';

function makeCar(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'npc', type: VehicleType.CAR, x: 0, y: 0, angle: Math.PI / 2, speed: 0, maxSpeed: 2.2,
    color: '#0bc', width: 16, height: 26, occupant: 'npc',
    waypoints: [], waypointIndex: 0, hp: 60,
    ...over,
  };
}

/** Run `step(dt)` for `seconds` of simulated time at `hz`. */
function simulate(hz: number, seconds: number, step: (dt: number) => void) {
  const n = Math.round(seconds * hz);
  for (let i = 0; i < n; i++) step(1 / hz);
}

const RATES = [30, 60, 144];

function expectSameAcrossRates(distances: number[]) {
  const ref = distances[1]; // 60 Hz, the rate everything was tuned at
  for (const d of distances) expect(Math.abs(d - ref) / ref).toBeLessThan(0.03);
}

describe('frameScale / decay', () => {
  it('is the identity at the tuned rate', () => {
    expect(frameScale(1 / SIM_HZ)).toBeCloseTo(1);
    expect(decay(0.85, 1 / SIM_HZ)).toBeCloseTo(0.85);
  });

  it('brakes by the same amount per second at any rate', () => {
    const after = (hz: number) => {
      let v = 2;
      simulate(hz, 1, dt => { v *= decay(0.85, dt); });
      return v;
    };
    expect(after(30)).toBeCloseTo(after(60), 10);
    expect(after(144)).toBeCloseTo(after(60), 10);
  });
});

describe('AI movement is frame-rate independent', () => {
  it('traffic covers the same ground in a second at 30, 60 and 144 Hz', () => {
    const distances = RATES.map(hz => {
      // Already at cruising speed, heading east toward a far waypoint.
      const v = makeCar({ speed: 2.2, waypoints: [{ x: 5000, y: 0 }] });
      simulate(hz, 1, dt => moveVehicleTowardWaypoint(v, dt));
      return v.x;
    });
    // 2.2 px per 60 Hz frame is 132 px/s.
    expect(distances[1]).toBeCloseTo(132, 0);
    expectSameAcrossRates(distances);
  });

  it('pulls away from a standstill at the same pace', () => {
    const distances = RATES.map(hz => {
      const v = makeCar({ waypoints: [{ x: 5000, y: 0 }] });
      simulate(hz, 1.5, dt => moveVehicleTowardWaypoint(v, dt));
      return v.x;
    });
    expectSameAcrossRates(distances);
  });

  it('keeps pace through closely spaced waypoints', () => {
    // A waypoint every tile: stopping for a step at each one used to cost
    // more time per second the lower the frame rate.
    const waypoints = Array.from({ length: 60 }, (_, i) => ({ x: (i + 1) * 40, y: 0 }));
    const distances = RATES.map(hz => {
      const v = makeCar({ speed: 2.2, waypoints: waypoints.map(p => ({ ...p })) });
      simulate(hz, 2, dt => moveVehicleTowardWaypoint(v, dt));
      return v.x;
    });
    expectSameAcrossRates(distances);
  });

  it('police pursuit steering covers the same ground', () => {
    const open = () => false;
    const distances = RATES.map(hz => {
      const v = makeCar({ type: VehicleType.POLICE, maxSpeed: 2.6, speed: 2.6 });
      simulate(hz, 1, dt => steerDirect(v, 5000, 0, dt, open));
      return v.x;
    });
    expectSameAcrossRates(distances);
  });
});

describe('Cadence', () => {
  it('fires once per period whatever the step size', () => {
    for (const hz of RATES) {
      const c = new Cadence(1);
      let fired = 0;
      simulate(hz, 10, dt => { if (c.step(dt)) fired++; });
      expect(fired).toBe(10);
    }
  });

  it('fires on the exact tick the old `tick % 60` did at 60 Hz', () => {
    const c = new Cadence(1);
    let firstAt = -1;
    for (let tick = 1; tick <= 120 && firstAt < 0; tick++) {
      if (c.step(1 / 60)) firstAt = tick;
    }
    expect(firstAt).toBe(60);
  });

  it('does not fire a burst to catch up after a long hitch', () => {
    const c = new Cadence(0.25);
    expect(c.step(2)).toBe(true);
    expect(c.step(0.01)).toBe(false);
  });
});

describe('frame gate', () => {
  it('lets every frame through when uncapped', () => {
    const g = createFrameGate();
    for (let i = 0; i < 10; i++) {
      g.advance(1 / 144, 0);
      expect(g.due).toBe(true);
    }
  });

  it('averages the cap on a faster screen instead of rounding down', () => {
    // 60 fps cap on a 144 Hz screen: the old reset-to-zero accumulator gave 48.
    const g = createFrameGate();
    let drawn = 0;
    let simulated = 0;
    simulate(144, 10, dt => {
      g.advance(dt, 60);
      if (g.due) { drawn++; simulated += g.delta; }
    });
    expect(drawn / 10).toBeGreaterThan(58);
    expect(drawn / 10).toBeLessThanOrEqual(61);
    // Every skipped frame's time reaches the simulation.
    expect(simulated).toBeGreaterThan(9.9);
  });

  it('halves a 60 Hz screen at a 30 cap', () => {
    const g = createFrameGate();
    let drawn = 0;
    simulate(60, 10, dt => { g.advance(dt, 30); if (g.due) drawn++; });
    expect(drawn).toBeGreaterThanOrEqual(299);
    expect(drawn).toBeLessThanOrEqual(301);
  });
});
