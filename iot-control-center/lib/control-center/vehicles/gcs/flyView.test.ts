import { describe, expect, it } from "vitest";

import stateV2Fixture from "../__fixtures__/state-v2.json";
import type { VehicleStateV2 } from "../types";
import { homeVector, mainStatus, missionAction, modesFor, ringAngle, stripButtons } from "./flyView";

const base = stateV2Fixture as unknown as VehicleStateV2;
const armedAt = (rel: number, gs = 0): VehicleStateV2 => ({ ...base, armed: true, gs, pos: { ...base.pos!, rel } });

describe("fly view main status", () => {
  it("follows QGC's order: no data, link lost, FC lost, then arming state", () => {
    expect(mainStatus(null, false, false).key).toBe("noData");
    expect(mainStatus(base, true, false)).toEqual({ key: "linkLost", level: "bad" });
    expect(mainStatus({ ...base, fc: { ok: false, age: 9, id: null } }, false, false).key).toBe("fcLost");
    expect(mainStatus(base, false, false)).toEqual({ key: "ready", level: "ok" });
    expect(mainStatus({ ...base, health: { prearm: false, bad: [], msgs: [] } }, false, false)).toEqual({ key: "notReady", level: "warn" });
    expect(mainStatus({ ...base, health: { prearm: true, bad: [], msgs: ["PreArm: GPS"] } }, false, false).key).toBe("notReady");
  });

  it("tells armed on the ground from flying or driving", () => {
    expect(mainStatus(armedAt(0.2), false, false)).toEqual({ key: "armed", level: "warn" });
    expect(mainStatus(armedAt(5), false, false).key).toBe("flying");
    expect(mainStatus(armedAt(0, 2), false, false).key).toBe("flying");
    expect(mainStatus(armedAt(5), false, true).key).toBe("armed"); // a rover's altitude means nothing
    expect(mainStatus(armedAt(0, 1), false, true).key).toBe("driving");
  });
});

describe("fly view tool strip", () => {
  const kinds = (s: VehicleStateV2 | null, rover: boolean) => stripButtons(s, rover).map((b) => `${b.kind}${b.enabled ? "" : "-"}`);

  it("offers arm on the ground and disarm once armed", () => {
    expect(kinds(base, false)).toEqual(["arm", "takeoff", "land-", "rtl-", "pause-", "mission"]);
    expect(kinds(armedAt(0), false)).toEqual(["disarm", "takeoff", "land", "rtl", "pause", "mission"]);
    // In the air: no disarming or taking off from the strip (force disarm stays in the actions panel).
    expect(kinds(armedAt(20), false)).toEqual(["disarm-", "takeoff-", "land", "rtl", "pause", "mission"]);
  });

  it("gives rovers no takeoff or land, and hides the mission button without mission support", () => {
    expect(kinds(base, true)).toEqual(["arm", "rtl-", "pause-", "mission"]);
    expect(kinds({ ...base, caps: [] }, true)).toEqual(["arm", "rtl-", "pause-"]);
  });

  it("disables everything until the arming state is known, and while data is stale", () => {
    expect(stripButtons(null, false).every((b) => !b.enabled)).toBe(true);
    expect(stripButtons(base, true, true).every((b) => !b.enabled)).toBe(true);
    expect(stripButtons(armedAt(20), false, true).every((b) => !b.enabled)).toBe(true);
  });
});

describe("mission button", () => {
  const running = { ...armedAt(10), mode: "AUTO", wp: { cur: 3, n: 6, dist: 20, xt: 0 } };
  it("pauses a running mission and continues one this page paused", () => {
    expect(missionAction(running)).toBe("missionPause");
    expect(missionAction(running, "mission_start")).toBe("missionPause");
    expect(missionAction(running, "mission_pause")).toBe("missionResume");
    expect(missionAction({ ...running, mode: "MISSION" })).toBe("missionPause"); // PX4
  });

  it("starts otherwise, including after a pause that left AUTO", () => {
    expect(missionAction(null)).toBe("missionStart");
    expect(missionAction(base)).toBe("missionStart");
    expect(missionAction({ ...running, mode: "LOITER" }, "mission_pause")).toBe("missionStart");
    expect(missionAction({ ...running, armed: false })).toBe("missionStart");
  });
});

describe("mode menu", () => {
  it("lists the autopilot's own modes", () => {
    expect(modesFor("drone", base)).toContain("LOITER");
    expect(modesFor("rover", base)).toContain("HOLD");
    expect(modesFor("drone", { ...base, veh: { cls: "copter", ap: "px4", mavType: 2 } })).toContain("MISSION");
  });
});

describe("compass", () => {
  it("places bearings clockwise from the top of a heading-up dial", () => {
    expect(ringAngle(0, 0)).toBe(0);
    expect(ringAngle(90, 0)).toBe(90);
    expect(ringAngle(0, 90)).toBe(270); // heading east: north is on the left
    expect(ringAngle(10, 350)).toBe(20);
  });

  it("points at home only when the vehicle has moved away from it", () => {
    expect(homeVector(base)).toBeNull();
    expect(homeVector(null)).toBeNull();
    const v = homeVector({ ...base, pos: { ...base.pos!, lat: base.home!.lat + 0.001 } });
    expect(v!.bearing).toBeCloseTo(180, 0);
    expect(v!.dist).toBeCloseTo(111, 0);
  });
});
