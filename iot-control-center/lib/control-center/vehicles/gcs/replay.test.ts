import { describe, expect, it } from "vitest";

import type { TelemetryPoint } from "../types";
import { sampleAt, segmentFlights } from "./replay";

const pt = (t: number, armed: boolean | null, over: Partial<TelemetryPoint> = {}): TelemetryPoint => ({
  vehicleId: "v",
  t,
  lat: 24.1477 + t / 1e9,
  lon: 120.6736,
  alt: 80,
  rel: armed ? 10 : 0,
  hdg: 0,
  gs: armed ? 5 : 0,
  batPct: 100 - t / 10_000,
  batV: 12.4,
  mode: armed ? "GUIDED" : "STABILIZE",
  armed,
  sats: 10,
  fix: 3,
  ...over,
});

describe("flight replay", () => {
  it("splits history into flights by arming and by long gaps, newest first", () => {
    const pts = [
      pt(0, false),
      ...Array.from({ length: 20 }, (_, i) => pt(10_000 + i * 2000, true)), // 38 s flight
      pt(60_000, false),
      pt(70_000, true), pt(75_000, true), // 5 s: too short, not a flight
      pt(80_000, false),
      ...Array.from({ length: 15 }, (_, i) => pt(100_000 + i * 2000, true)), // 28 s...
      ...Array.from({ length: 15 }, (_, i) => pt(300_000 + i * 2000, true)), // ...then a 170 s gap: a new flight
    ];
    const flights = segmentFlights(pts);
    expect(flights.map((f) => [f.start, f.end])).toEqual([
      [300_000, 328_000],
      [100_000, 128_000],
      [10_000, 48_000],
    ]);
    expect(flights[2].maxRel).toBe(10);
    expect(flights[2].batStart).toBeGreaterThan(flights[2].batEnd!);
    expect(segmentFlights([pt(0, null), pt(1000, false)])).toEqual([]);
  });

  it("interpolates between points, headings the short way round", () => {
    const pts = [pt(0, true, { lat: 24, rel: 0, hdg: 350, gs: 0 }), pt(2000, true, { lat: 24.002, rel: 20, hdg: 10, gs: 4, mode: "AUTO" })];
    const mid = sampleAt(pts, 1000)!;
    expect(mid.lat).toBeCloseTo(24.001, 6);
    expect(mid.rel).toBe(10);
    expect(mid.gs).toBe(2);
    expect(mid.hdg).toBeCloseTo(0, 6);
    expect(sampleAt(pts, 1500)!.mode).toBe("AUTO");
    expect(sampleAt(pts, -5)!.lat).toBe(24);
    expect(sampleAt(pts, 9999)!.lat).toBe(24.002);
    expect(sampleAt([], 0)).toBeNull();
  });
});
