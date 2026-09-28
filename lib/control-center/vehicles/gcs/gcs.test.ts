import { describe, expect, it } from "vitest";

import stateV2Fixture from "../__fixtures__/state-v2.json";
import type { VehicleStateV2 } from "../types";
import { trafficLabel, trafficLevel, worstTraffic } from "./adsb";
import { AlertEngine } from "./alerts";
import { angleDiff, bearingDeg, destination, distanceM, formatDistance, wrap360 } from "./geo";
import { batteryLevel, companionLevel, ekfLevel, gpsLevel, prearmLevel, radioPct, vibeLevel } from "./health";
import { headingTicks, horizon, niceStep, pitchRungs, tapeTicks } from "./hud";
import { PREFETCH_MAX_TILES, TILE_LAYERS, tileXY, tilesForBounds } from "./tiles";
import { pickLink, Staleness } from "../link/select";
import { blockedReason, socketUrl } from "../link/directLink";

const base = stateV2Fixture as unknown as VehicleStateV2;
const st = (patch: Partial<VehicleStateV2>): VehicleStateV2 => ({ ...base, ...patch });

describe("geo", () => {
  it("wraps and diffs angles", () => {
    expect(wrap360(-10)).toBe(350);
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(350, 10)).toBe(-20);
  });
  it("measures distance and bearing consistently with destination", () => {
    const p = destination(25.033, 121.5654, 45, 1000);
    expect(distanceM(25.033, 121.5654, p.lat, p.lon)).toBeCloseTo(1000, 0);
    expect(bearingDeg(25.033, 121.5654, p.lat, p.lon)).toBeCloseTo(45, 0);
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(1250)).toBe("1.25 km");
  });
});

describe("hud geometry", () => {
  it("moves the horizon down when the nose goes up", () => {
    const level = horizon(0, 0, 100, 100, 5);
    const noseUp = horizon(0, 10, 100, 100, 5);
    expect(level.centre).toEqual({ x: 100, y: 100 });
    expect(noseUp.centre.y).toBeCloseTo(150);
    expect(noseUp.centre.x).toBeCloseTo(100);
  });
  it("tilts the horizon against the bank", () => {
    const right = horizon(30, 0, 100, 100, 5);
    // Right wing down: the horizon turns counter-clockwise on screen, so its
    // left end sits lower (larger y) than its right end.
    expect(right.angleRad).toBeCloseTo(-Math.PI / 6);
    expect(right.a.y).toBeGreaterThan(right.b.y);
  });
  it("lists pitch rungs around the current pitch, never the horizon itself", () => {
    expect(pitchRungs(0)).toEqual([-20, -10, 10, 20]);
    expect(pitchRungs(85)).toEqual([60, 70, 80, 90]);
  });
  it("places higher tape values above the centre", () => {
    const ticks = tapeTicks(10, 50, 10, 1);
    const eleven = ticks.find((t) => t.value === 11)!;
    expect(eleven.offset).toBe(-10);
    expect(ticks.find((t) => t.value === 10)!.major).toBe(true);
  });
  it("wraps heading ticks through north with cardinal labels", () => {
    const ticks = headingTicks(355, 60, 3);
    const north = ticks.find((t) => t.value === 0)!;
    expect(north.label).toBe("N");
    expect(north.offset).toBe(15);
    expect(ticks.some((t) => t.value === 340)).toBe(true);
  });
  it("picks readable tape steps", () => {
    expect(niceStep(60)).toBe(10);
    expect(niceStep(6)).toBe(1);
  });
});

describe("health levels", () => {
  it("never judges missing data", () => {
    expect(gpsLevel(null)).toBe("unknown");
    expect(batteryLevel(null)).toBe("unknown");
    expect(ekfLevel(null)).toBe("unknown");
    expect(vibeLevel(null)).toBe("unknown");
    expect(companionLevel(null)).toBe("unknown");
    expect(batteryLevel({ v: null, a: null, pct: null, mah: null, cells: null, cellV: null, cellAvg: false })).toBe("unknown");
  });
  it("grades GPS", () => {
    expect(gpsLevel({ fix: 3, sats: 14, hdop: 0.8 })).toBe("ok");
    expect(gpsLevel({ fix: 3, sats: 14, hdop: 2.1 })).toBe("warn");
    expect(gpsLevel({ fix: 1, sats: 3, hdop: 9 })).toBe("bad");
  });
  it("grades the battery by cell voltage before percentage", () => {
    const b = { v: 14.2, a: 10, pct: 90, mah: 0, cells: 4, cellV: 3.55, cellAvg: true };
    expect(batteryLevel(b)).toBe("warn");
    expect(batteryLevel({ ...b, cellV: 3.4 })).toBe("bad");
    expect(batteryLevel({ ...b, cellV: null, pct: 20 })).toBe("warn");
  });
  it("uses Mission Planner's EKF and vibration thresholds", () => {
    expect(ekfLevel({ ...base.ekf!, worst: 0.6 })).toBe("warn");
    expect(ekfLevel({ ...base.ekf!, worst: 0.9 })).toBe("bad");
    expect(vibeLevel({ x: 20, y: 25, z: 35, clip: [0, 0, 0] })).toBe("warn");
    expect(vibeLevel({ x: 20, y: 25, z: 65, clip: [0, 0, 0] })).toBe("bad");
    expect(vibeLevel({ x: 5, y: 5, z: 5, clip: [0, 0, 0] }, true)).toBe("warn");
  });
  it("flags Pi under-voltage", () => {
    const c = base.comp!;
    expect(companionLevel({ ...c, throttled: ["under_voltage"] })).toBe("bad");
    expect(companionLevel({ ...c, throttled: ["under_voltage_seen"] })).toBe("warn");
    expect(companionLevel({ ...c, throttled: [] })).toBe("ok");
  });
  it("reads pre-arm state and radio RSSI", () => {
    expect(prearmLevel({ prearm: true, bad: [], msgs: [] })).toBe("ok");
    expect(prearmLevel({ prearm: true, bad: [], msgs: ["PreArm: GPS not healthy"] })).toBe("bad");
    expect(prearmLevel({ prearm: null, bad: [], msgs: [] })).toBe("unknown");
    expect(radioPct(254)).toBe(100);
    expect(radioPct(255)).toBeNull();
  });
});

describe("AlertEngine", () => {
  it("announces mode and arming changes, not the first sample", () => {
    const e = new AlertEngine();
    expect(e.update({ state: st({ mode: "STABILIZE", armed: false }), linkOk: true, now: 0 })).toEqual([]);
    const out = e.update({ state: st({ mode: "GUIDED", armed: true }), linkOk: true, now: 100 });
    expect(out.map((a) => a.kind)).toEqual(["mode", "armed"]);
    expect(out[0].params.mode).toBe("GUIDED");
  });

  it("waits for a low battery to persist and ignores missing readings", () => {
    const e = new AlertEngine();
    const low = st({ bat: { ...base.bat!, cellV: 3.55 } });
    expect(e.update({ state: low, linkOk: true, now: 0 })).toEqual([]);
    // A dropped reading neither triggers nor resets anything.
    expect(e.update({ state: st({ bat: null }), linkOk: true, now: 2000 })).toEqual([]);
    expect(e.update({ state: low, linkOk: true, now: 4000 })).toEqual([]);
    const fired = e.update({ state: low, linkOk: true, now: 5100 });
    expect(fired.map((a) => a.kind)).toEqual(["batteryLow"]);
    expect(e.update({ state: low, linkOk: true, now: 9000 })).toEqual([]);
  });

  it("reports link loss once, then its return", () => {
    const e = new AlertEngine();
    e.update({ state: st({}), linkOk: true, now: 0 });
    expect(e.update({ state: null, linkOk: false, now: 1000 })).toEqual([]);
    expect(e.update({ state: null, linkOk: false, now: 4100 }).map((a) => a.kind)).toEqual(["linkLost"]);
    expect(e.update({ state: null, linkOk: false, now: 6000 })).toEqual([]);
    e.update({ state: st({}), linkOk: true, now: 7000 });
    const back = e.update({ state: st({}), linkOk: true, now: 10_200 });
    expect(back.map((a) => a.kind)).toEqual(["linkRestored"]);
  });

  it("speaks critical STATUSTEXT only", () => {
    const e = new AlertEngine();
    expect(e.text({ sev: 2, text: "Battery failsafe" }, 1)?.params.text).toBe("Battery failsafe");
    expect(e.text({ sev: 6, text: "Mode GUIDED" }, 1)).toBeNull();
  });
});

describe("ADS-B traffic", () => {
  const plane = (icao: string, d: number | null, dz: number | null, cs: string | null = null) =>
    ({ icao, cs, lat: 24.1, lon: 120.6, alt: 500, hdg: 90, spd: 60, vs: 0, emitter: 1, squawk: 1200, age: 1, d, dz });

  it("grades by distance and height difference", () => {
    expect(trafficLevel(plane("A", 800, 100))).toBe("alarm");
    expect(trafficLevel(plane("A", 800, -400))).toBe("none");
    expect(trafficLevel(plane("A", 2500, 250))).toBe("warn");
    expect(trafficLevel(plane("A", 900, null))).toBe("alarm"); // unknown altitude: could be at ours
    expect(trafficLevel(plane("A", null, 0))).toBe("none"); // our own position unknown
  });

  it("picks the most urgent, then the nearest", () => {
    const w = worstTraffic([plane("FAR", 2000, 0), plane("NEAR", 500, 50, "CAL1"), plane("HIGH", 300, 900)]);
    expect(w?.target.icao).toBe("NEAR");
    expect(w?.level).toBe("alarm");
    expect(trafficLabel(w!.target)).toBe("CAL1");
    expect(worstTraffic([plane("HIGH", 300, 900)])).toBeNull();
  });

  it("speaks close traffic at once and repeats every 30 s, and never without a receiver", () => {
    const e = new AlertEngine();
    expect(e.update({ state: st({ adsb: null }), linkOk: true, now: 0 })).toEqual([]);
    const close = st({ adsb: [plane("899003", 250, 60, "N0NEAR")] });
    const out = e.update({ state: close, linkOk: true, now: 1000 });
    expect(out.map((a) => a.kind)).toEqual(["traffic"]);
    expect(out[0].params).toEqual({ name: "N0NEAR", dist: 250, dz: "+60" });
    expect(e.update({ state: close, linkOk: true, now: 20_000 })).toEqual([]);
    expect(e.update({ state: close, linkOk: true, now: 31_100 }).map((a) => a.kind)).toEqual(["traffic"]);
  });
});

describe("link selection", () => {
  it("prefers a fresh direct link, then the cloud", () => {
    const now = 10_000;
    expect(pickLink({ enabled: true, lastRxAt: now - 200 }, { enabled: true, lastRxAt: now - 900 }, now)).toBe("direct");
    expect(pickLink({ enabled: true, lastRxAt: now - 2000 }, { enabled: true, lastRxAt: now - 900 }, now)).toBe("cloud");
    expect(pickLink({ enabled: false, lastRxAt: null }, { enabled: true, lastRxAt: now - 6000 }, now)).toBe("none");
  });

  it("goes stale after silence and needs steady messages to recover", () => {
    const s = new Staleness(5000, 3000);
    expect(s.isStale(0)).toBe(true);
    s.onMessage(0);
    expect(s.isStale(1000)).toBe(false);
    expect(s.isStale(5000)).toBe(true);
    s.onMessage(9000); // one late message is not enough
    expect(s.isStale(9100)).toBe(true);
    s.onMessage(10_000);
    expect(s.isStale(10_100)).toBe(false);
  });

  it("builds socket URLs and spots URLs a page cannot open", () => {
    expect(socketUrl("wss://drone.ts.net")).toBe("wss://drone.ts.net/ws");
    expect(socketUrl("wss://drone.ts.net:8765/custom")).toBe("wss://drone.ts.net:8765/custom");
    expect(blockedReason("ws://192.168.1.20:8765", "https:")).toBe("mixedContent");
    expect(blockedReason("ws://localhost:8765", "https:")).toBeNull();
    expect(blockedReason("ws://192.168.1.20:8765", "http:")).toBeNull();
    expect(blockedReason("https://x", "http:")).toBe("badUrl");
  });
});

describe("tiles", () => {
  it("computes slippy tile numbers", () => {
    expect(tileXY(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(tileXY(25.033, 121.5654, 16)).toEqual({ x: 54898, y: 28058 });
  });
  it("lists prefetch URLs and refuses oversized areas", () => {
    const nlsc = TILE_LAYERS.find((l) => l.id === "nlsc-photo")!;
    const small = tilesForBounds(nlsc, { north: 25.035, south: 25.031, east: 121.568, west: 121.563 }, 15, 17);
    expect(small && small.length).toBeGreaterThan(0);
    expect(small![0]).toMatch(/^https:\/\/wmts\.nlsc\.gov\.tw\/wmts\/PHOTO2\/default\/GoogleMapsCompatible\/15\/\d+\/\d+$/);
    expect(tilesForBounds(nlsc, { north: 26, south: 22, east: 122, west: 120 }, 10, 16)).toBeNull();
    expect(PREFETCH_MAX_TILES).toBeGreaterThan(100);
    expect(TILE_LAYERS.filter((l) => l.prefetch).every((l) => l.id.startsWith("nlsc"))).toBe(true);
  });
});
