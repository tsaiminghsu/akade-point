import { describe, expect, it } from "vitest";

import { distanceM, bearingDeg } from "./geo";
import { FOLLOW_LIMITS, followStartBlock, followStep, leadFix, stationFor } from "./followMe";

const me = { lat: 24.1477, lon: 120.6736, accuracy: 5, at: 10_000 };
const settings = { distance: 10, bearing: 180, alt: 15 };

describe("follow me", () => {
  it("stations the vehicle at the offset from the operator", () => {
    const st = stationFor(me, settings);
    expect(distanceM(me.lat, me.lon, st.lat, st.lon)).toBeCloseTo(10, 1);
    expect(bearingDeg(me.lat, me.lon, st.lat, st.lon)).toBeCloseTo(180, 0);
    expect(stationFor(me, { ...settings, distance: 0 })).toEqual({ lat: me.lat, lon: me.lon });
  });

  it("sends on the first fix, then only after a real move or a while", () => {
    const first = followStep(me, 10_100, settings, null);
    expect(first.kind).toBe("send");
    const sent = { ...(first as { lat: number; lon: number }), at: 10_100 };
    // 1 m of GPS wander: keep the current target.
    const wander = { ...me, lat: me.lat + 0.000009, at: 11_000 };
    expect(followStep(wander, 11_000, settings, sent).kind).toBe("wait");
    // Walked 5 m: new target.
    const walked = { ...me, lat: me.lat + 0.000045, at: 12_000 };
    expect(followStep(walked, 12_000, settings, sent).kind).toBe("send");
    // Standing still, but the last target is getting old.
    expect(followStep({ ...me, at: 15_000 }, 15_200, settings, sent).kind).toBe("send");
  });

  it("never acts on a poor or stale fix", () => {
    expect(followStep({ ...me, accuracy: 35 }, 10_100, settings, null)).toEqual({ kind: "poorFix", accuracy: 35 });
    expect(followStep(me, me.at + FOLLOW_LIMITS.staleMs + 1, settings, null).kind).toBe("stale");
    expect(followStep(null, 0, settings, null).kind).toBe("stale");
  });

  it("refuses to start far from the vehicle or without a fix", () => {
    expect(followStartBlock(me, { lat: me.lat + 0.001, lon: me.lon }, 10_000)).toBeNull(); // ~111 m
    expect(followStartBlock(me, { lat: me.lat + 0.004, lon: me.lon }, 10_000)).toBe("tooFar"); // ~445 m
    expect(followStartBlock(null, null, 0)).toBe("noFix");
    expect(followStartBlock({ ...me, accuracy: 60 }, null, 10_000)).toBe("poorFix");
    expect(followStartBlock(me, null, 10_000)).toBe("noVehiclePos");
  });

  it("leads the operator along their motion, but not on wander or jumps", () => {
    const prev = { ...me, at: 9_000 };
    const walking = { ...me, lat: me.lat + 2 / 111_320, at: 10_000 }; // 2 m/s north
    const led = leadFix(walking, prev);
    expect(distanceM(walking.lat, walking.lon, led.lat, led.lon)).toBeCloseTo(2 * FOLLOW_LIMITS.leadS, 0);
    expect(led.lat).toBeGreaterThan(walking.lat);
    expect(leadFix({ ...me, lat: me.lat + 0.3 / 111_320, at: 10_000 }, prev)).toEqual({ ...me, lat: me.lat + 0.3 / 111_320, at: 10_000 });
    const jump = { ...me, lat: me.lat + 80 / 111_320, at: 10_000 };
    expect(leadFix(jump, prev)).toEqual(jump);
    expect(leadFix(walking, null)).toEqual(walking);
  });
});
