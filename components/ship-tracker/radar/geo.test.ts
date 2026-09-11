import { describe, expect, it } from 'vitest';

import {
  bearingDelta,
  destinationPoint,
  fromLocalPlane,
  haversineNm,
  initialBearing,
  normalizeDeg,
  polarToVec,
  relativeBearing,
  toLocalPlane,
  turnToward,
  vecToPolar,
} from './geo';

describe('normalizeDeg', () => {
  it('wraps negatives into the positive circle', () => {
    expect(normalizeDeg(-10)).toBeCloseTo(350);
    expect(normalizeDeg(-370)).toBeCloseTo(350);
  });

  it('maps a full turn back to zero', () => {
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(720)).toBe(0);
  });
});

describe('bearingDelta', () => {
  it('takes the short way round the north point', () => {
    expect(bearingDelta(350, 10)).toBeCloseTo(20);
    expect(bearingDelta(10, 350)).toBeCloseTo(-20);
  });

  it('reports starboard turns as positive', () => {
    expect(bearingDelta(0, 90)).toBeCloseTo(90);
    expect(bearingDelta(90, 0)).toBeCloseTo(-90);
  });

  it('resolves the exact reciprocal to +180 rather than -180', () => {
    expect(bearingDelta(0, 180)).toBeCloseTo(180);
  });
});

describe('haversineNm', () => {
  it('makes one minute of latitude one nautical mile', () => {
    expect(haversineNm({ lat: 22, lon: 120 }, { lat: 22 + 1 / 60, lon: 120 })).toBeCloseTo(1, 2);
  });

  it('is zero for a point against itself', () => {
    expect(haversineNm({ lat: 22.6, lon: 120.3 }, { lat: 22.6, lon: 120.3 })).toBe(0);
  });
});

describe('initialBearing', () => {
  it('reads due north along a meridian', () => {
    expect(initialBearing({ lat: 22, lon: 120 }, { lat: 23, lon: 120 })).toBeCloseTo(0, 4);
  });

  it('starts a due-east great circle slightly north of 090', () => {
    // Following a parallel is a rhumb line, not a great circle. The shortest
    // path to a point due east departs a little to the north and curves back,
    // so 089.8 here is correct and 090.0 would mean the maths had gone flat.
    const b = initialBearing({ lat: 22, lon: 120 }, { lat: 22, lon: 121 });
    expect(b).toBeCloseTo(89.81, 1);
    expect(b).toBeLessThan(90);
  });
});

describe('destinationPoint', () => {
  it('inverts haversineNm and initialBearing', () => {
    const origin = { lat: 22.595, lon: 120.23 };
    const target = destinationPoint(origin, 47, 3.5);
    expect(haversineNm(origin, target)).toBeCloseTo(3.5, 5);
    expect(initialBearing(origin, target)).toBeCloseTo(47, 2);
  });

  it('makes sixty nautical miles exactly one degree of latitude', () => {
    // This is the identity the chosen Earth radius exists to preserve, and it
    // is what keeps the great-circle helpers agreeing with toLocalPlane.
    const p = destinationPoint({ lat: 22, lon: 120 }, 0, 60);
    expect(p.lat).toBeCloseTo(23, 9);
    expect(p.lon).toBeCloseTo(120, 6);
  });
});

describe('local plane projection', () => {
  const origin = { lat: 22.595, lon: 120.23 };

  it('puts north in +y and east in +x', () => {
    const north = toLocalPlane(origin, { lat: origin.lat + 1 / 60, lon: origin.lon });
    expect(north.y).toBeCloseTo(1, 3);
    expect(north.x).toBeCloseTo(0, 6);

    const east = toLocalPlane(origin, { lat: origin.lat, lon: origin.lon + 1 / 60 });
    expect(east.x).toBeGreaterThan(0.9);
    expect(east.y).toBeCloseTo(0, 6);
  });

  it('round-trips through fromLocalPlane', () => {
    const p = { lat: 22.641, lon: 120.288 };
    const back = fromLocalPlane(origin, toLocalPlane(origin, p));
    expect(back.lat).toBeCloseTo(p.lat, 6);
    expect(back.lon).toBeCloseTo(p.lon, 6);
  });

  it('agrees with the great-circle distance at radar ranges', () => {
    const p = { lat: 22.65, lon: 120.3 };
    const v = toLocalPlane(origin, p);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(haversineNm(origin, p), 2);
  });
});

describe('polar conversion', () => {
  it('places 090 on the +x axis and 000 on +y', () => {
    expect(polarToVec(90, 2)).toEqual({ x: expect.closeTo(2, 6), y: expect.closeTo(0, 6) });
    expect(polarToVec(0, 2)).toEqual({ x: expect.closeTo(0, 6), y: expect.closeTo(2, 6) });
  });

  it('round-trips an arbitrary bearing', () => {
    const p = vecToPolar(polarToVec(217, 4.2));
    expect(p.bearing).toBeCloseTo(217, 6);
    expect(p.range).toBeCloseTo(4.2, 6);
  });
});

describe('relativeBearing', () => {
  it('measures clockwise from own head', () => {
    expect(relativeBearing(90, 45)).toBeCloseTo(45);
    expect(relativeBearing(10, 45)).toBeCloseTo(325);
  });
});

describe('turnToward', () => {
  it('stops exactly on the ordered course when it is within reach', () => {
    expect(turnToward(10, 20, 30)).toBeCloseTo(20);
  });

  it('turns the short way across north', () => {
    expect(turnToward(350, 10, 5)).toBeCloseTo(355);
    expect(turnToward(10, 350, 5)).toBeCloseTo(5);
  });

  it('never overshoots the rate limit', () => {
    expect(turnToward(0, 180, 10)).toBeCloseTo(10);
  });
});
