import { describe, expect, it } from "vitest";

import { distanceM } from "../gcs/geo";
import { commandsFor, cmdMeta } from "./mavCmdMeta";
import {
  CAMERA_PRESETS,
  inPolygon,
  insideFence,
  missionStats,
  polygonsFromGeoJson,
  resumeFrom,
  surveyFootprint,
  surveyGrid,
  validateFence,
  validateMission,
} from "./missionTools";
import {
  blankItem,
  diffItems,
  fenceToItems,
  itemsToFence,
  itemsToMission,
  itemsToRally,
  missionToItems,
  rallyToItems,
  type FenceDoc,
  type MissionDoc,
} from "./planModel";

const HOME = { lat: 25.033, lon: 121.5654, alt: 12 };
const wp = (lat: number, lon: number, alt = 30) => blankItem(16, lat, lon, alt);
const mission = (...items: ReturnType<typeof blankItem>[]): MissionDoc => ({ home: HOME, items });

describe("command metadata", () => {
  it("offers copter-only commands only to copters", () => {
    const rover = commandsFor("mission", "rover").map((m) => m.id);
    expect(rover).not.toContain(22);
    expect(rover).toContain(16);
    expect(commandsFor("mission", "copter").map((m) => m.id)).toContain(22);
    expect(commandsFor("fence", "copter").map((m) => m.id)).toEqual([5001, 5002, 5003, 5004, 5000]);
    expect(cmdMeta(178)?.defaults?.p1).toBe(1);
  });
});

describe("plan model conversions", () => {
  it("round-trips a mission with the home item at seq 0", () => {
    const doc = mission(blankItem(22, 0, 0, 10), wp(25.034, 121.566), blankItem(20, 0, 0, 0));
    const items = missionToItems(doc);
    expect(items.map((i) => i.seq)).toEqual([0, 1, 2, 3]);
    expect(items[0]).toMatchObject({ cmd: 16, frame: 0, lat: HOME.lat, cur: 1 });
    const back = itemsToMission(items);
    expect(back.home).toEqual(HOME);
    expect(back.items.map((i) => i.cmd)).toEqual([22, 16, 20]);
  });

  it("stores fence polygons with the vertex count in param1", () => {
    const fence: FenceDoc = {
      polygons: [
        { key: "a", inclusion: true, points: [[25.03, 121.56], [25.03, 121.57], [25.04, 121.57], [25.04, 121.56]] },
        { key: "b", inclusion: false, points: [[25.035, 121.565], [25.035, 121.566], [25.036, 121.566]] },
      ],
      circles: [{ key: "c", inclusion: true, lat: 25.033, lon: 121.565, radius: 300 }],
      returnPoint: { lat: 25.033, lon: 121.5654 },
    };
    const items = fenceToItems(fence);
    expect(items.map((i) => i.cmd)).toEqual([5001, 5001, 5001, 5001, 5002, 5002, 5002, 5003, 5000]);
    expect(items.slice(0, 4).every((i) => i.p1 === 4)).toBe(true);
    expect(items[7].p1).toBe(300);
    const back = itemsToFence(items);
    expect(back.polygons.map((p) => [p.inclusion, p.points.length])).toEqual([[true, 4], [false, 3]]);
    expect(back.circles[0].radius).toBe(300);
    expect(back.returnPoint).toEqual({ lat: 25.033, lon: 121.5654 });
  });

  it("round-trips rally points", () => {
    const items = rallyToItems([{ key: "r", lat: 25.03, lon: 121.56, alt: 30 }]);
    expect(items[0]).toMatchObject({ seq: 0, cmd: 5100, frame: 3, alt: 30 });
    expect(itemsToRally(items)[0]).toMatchObject({ lat: 25.03, alt: 30 });
  });

  it("finds items the vehicle holds differently, ignoring home and float32 noise", () => {
    const sent = missionToItems(mission(wp(25.034, 121.566), wp(25.035, 121.567)));
    const got = sent.map((i) => ({ ...i }));
    got[0] = { ...got[0], lat: 1, lon: 1 }; // the autopilot's own home
    got[1] = { ...got[1], lat: got[1].lat + 1e-8 };
    expect(diffItems(sent, got, "mission")).toEqual([]);
    got[2] = { ...got[2], alt: 99 };
    expect(diffItems(sent, got, "mission")).toEqual([2]);
    expect(diffItems(sent, got.slice(0, 2), "mission")).toEqual([2]);
  });
});

describe("mission statistics", () => {
  it("adds legs, climbs, holds and the RTL leg home", () => {
    const a = wp(25.034, 121.5654, 20);
    const b = { ...wp(25.034, 121.5664, 20), p1: 10 };
    const s = missionStats(mission(blankItem(22, 0, 0, 20), a, b, blankItem(20, 0, 0, 0)), 5);
    const legA = distanceM(HOME.lat, HOME.lon, a.lat, a.lon);
    const legB = distanceM(a.lat, a.lon, b.lat, b.lon);
    const legHome = distanceM(b.lat, b.lon, HOME.lat, HOME.lon);
    expect(s.distance).toBeCloseTo(legA + legB + legHome, 3);
    expect(s.waypoints).toBe(3);
    expect(s.maxAlt).toBe(20);
    expect(s.duration).toBeGreaterThan((legA + legB + legHome) / 5 + 10);
  });
});

describe("mission validation", () => {
  const keys = (issues: { key: string }[]) => issues.map((i) => i.key);

  it("wants a takeoff first on a copter, and legal altitudes", () => {
    const issues = validateMission(mission(wp(25.034, 121.566, 150)), "copter");
    expect(keys(issues)).toEqual(expect.arrayContaining(["noTakeoff", "altOverLimit"]));
    expect(keys(validateMission(mission(blankItem(22, 0, 0, 10), wp(25.034, 121.566)), "copter"))).toEqual([]);
  });

  it("flags zero positions, far waypoints, bad jumps and empty plans", () => {
    const far = wp(25.2, 121.566);
    const jump = { ...blankItem(177, 0, 0, 0), p1: 9 };
    const issues = validateMission(mission(blankItem(22, 0, 0, 10), wp(0, 0), far, jump), "copter");
    expect(keys(issues)).toEqual(expect.arrayContaining(["zeroLatLon", "farFromHome", "badJump"]));
    expect(issues.find((i) => i.key === "zeroLatLon")?.item).toBe(2);
    expect(keys(validateMission(mission(), "rover"))).toContain("noNav");
  });

  it("does not ask a rover to take off and notes ignored altitudes", () => {
    const issues = validateMission(mission(wp(25.034, 121.566, 10)), "rover");
    expect(keys(issues)).toEqual(["roverAlt"]);
  });

  it("checks waypoints against the fence", () => {
    const fence: FenceDoc = {
      polygons: [{ key: "a", inclusion: true, points: [[25.03, 121.56], [25.03, 121.57], [25.04, 121.57], [25.04, 121.56]] }],
      circles: [{ key: "x", inclusion: false, lat: 25.035, lon: 121.565, radius: 50 }],
      returnPoint: null,
    };
    expect(insideFence(25.033, 121.563, fence)).toBe(true);
    expect(insideFence(25.05, 121.563, fence)).toBe(false);
    expect(insideFence(25.035, 121.565, fence)).toBe(false);
    const issues = validateMission(mission(blankItem(22, 0, 0, 10), wp(25.05, 121.563)), "copter", { fence });
    expect(keys(issues)).toContain("outsideFence");
    expect(keys(validateFence({ polygons: [{ key: "p", inclusion: true, points: [[1, 1], [1, 2]] }], circles: [], returnPoint: null }))).toEqual(["polygonTooSmall"]);
  });

  it("uses a proper point-in-polygon test for concave shapes", () => {
    const u: [number, number][] = [[0, 0], [0, 3], [3, 3], [3, 2], [1, 2], [1, 1], [3, 1], [3, 0]];
    expect(inPolygon(0.5, 1.5, u)).toBe(true);
    // Inside the notch of the U (between its arms).
    expect(inPolygon(2, 1.5, u)).toBe(false);
    expect(inPolygon(2, 0.5, u)).toBe(true);
  });
});

describe("resume from a waypoint", () => {
  const doc = mission(
    blankItem(22, 0, 0, 20),
    { ...blankItem(178, 0, 0, 0), p2: 8 },
    wp(25.034, 121.566, 25),
    { ...blankItem(206, 0, 0, 0), p1: 12 },
    wp(25.035, 121.567, 30),
    { ...blankItem(177, 0, 0, 0), p1: 3, p2: 2 },
    { ...blankItem(177, 0, 0, 0), p1: 7, p2: 1 },
    blankItem(20, 0, 0, 0)
  );

  it("takes off to the resume altitude and carries speed and camera settings", () => {
    const { doc: out, droppedJumps } = resumeFrom(doc, 5, "copter");
    expect(out.items.map((i) => i.cmd)).toEqual([22, 178, 206, 16, 177, 20]);
    expect(out.items[0].alt).toBe(30);
    expect(out.items[1].p2).toBe(8);
    expect(out.items[2].p1).toBe(12);
    // Jump to item 3 (before the resume point) dropped; jump to 7 renumbered.
    expect(droppedJumps).toBe(1);
    expect(out.items[4].p1).toBe(7 - 4 + 3);
  });

  it("does not add a takeoff for a rover", () => {
    const { doc: out } = resumeFrom(doc, 3, "rover");
    expect(out.items[0].cmd).toBe(178);
    expect(out.items.find((i) => i.cmd === 22)).toBeUndefined();
  });
});

describe("survey grid", () => {
  const square: [number, number][] = [
    [25.03, 121.56],
    [25.03, 121.563],
    [25.0327, 121.563],
    [25.0327, 121.56],
  ];

  it("derives footprint, spacing and trigger distance from the camera", () => {
    const f = surveyFootprint(50, CAMERA_PRESETS.piCam3);
    expect(f.groundW).toBeCloseTo((50 * 6.45) / 4.74, 5);
    const r = surveyGrid({ polygon: square, alt: 50, camera: CAMERA_PRESETS.piCam3, frontOverlap: 75, sideOverlap: 65, angle: 0, trigger: true })!;
    expect(r.laneSpacing).toBeCloseTo(f.groundW * 0.35, 5);
    expect(r.triggerDistance).toBeCloseTo(f.groundH * 0.25, 5);
    expect(r.items[0].cmd).toBe(206);
    expect(r.items[r.items.length - 1]).toMatchObject({ cmd: 206, p1: 0 });
    expect(r.gsd).toBeGreaterThan(0);
  });

  it("covers the polygon with alternating lanes that stay inside it", () => {
    const r = surveyGrid({ polygon: square, alt: 60, camera: CAMERA_PRESETS.piCam3, frontOverlap: 70, sideOverlap: 60, angle: 90 })!;
    const wps = r.items.filter((i) => i.cmd === 16);
    expect(wps.length).toBe(r.lanes * 2);
    for (const w of wps) {
      expect(w.lat).toBeGreaterThanOrEqual(25.03 - 1e-6);
      expect(w.lat).toBeLessThanOrEqual(25.0327 + 1e-6);
      expect(w.lon).toBeGreaterThanOrEqual(121.56 - 1e-6);
      expect(w.lon).toBeLessThanOrEqual(121.563 + 1e-6);
      expect(w.alt).toBe(60);
    }
    // Lanes run east-west (angle 90) and alternate direction.
    const dir1 = Math.sign(wps[1].lon - wps[0].lon);
    const dir2 = Math.sign(wps[3].lon - wps[2].lon);
    expect(dir1).not.toBe(0);
    expect(dir2).toBe(-dir1);
    expect(wps[0].lat).toBeCloseTo(wps[1].lat, 6);
  });

  it("rejects unusable inputs", () => {
    expect(surveyGrid({ polygon: square.slice(0, 2), alt: 50, camera: CAMERA_PRESETS.piCam3, frontOverlap: 70, sideOverlap: 60, angle: 0 })).toBeNull();
    expect(surveyGrid({ polygon: square, alt: 50, camera: CAMERA_PRESETS.piCam3, frontOverlap: 70, sideOverlap: 100, angle: 0 })).toBeNull();
  });
});

describe("GeoJSON import", () => {
  it("reads outer rings of polygons in any wrapper, as lat/lon", () => {
    const gj = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[121.56, 25.03], [121.57, 25.03], [121.57, 25.04], [121.56, 25.03]], [[0, 0], [1, 1], [0, 1]]] } },
        { type: "Feature", geometry: { type: "Point", coordinates: [121, 25] } },
        { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[[[1, 2], [3, 4], [5, 6]]]] } },
      ],
    };
    const polys = polygonsFromGeoJson(gj);
    expect(polys).toHaveLength(2);
    expect(polys[0]).toEqual([[25.03, 121.56], [25.03, 121.57], [25.04, 121.57]]);
    expect(polys[1][0]).toEqual([2, 1]);
    expect(polygonsFromGeoJson("nonsense")).toEqual([]);
  });
});
