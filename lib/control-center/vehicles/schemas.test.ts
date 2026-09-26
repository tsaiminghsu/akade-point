import { describe, expect, it } from "vitest";

import {
  commandRequestSchema,
  missionItemSchema,
  telemetryPostSchema,
  vehiclePatchSchema,
} from "./schemas";
import stateV2Fixture from "./__fixtures__/state-v2.json";

describe("commandRequestSchema", () => {
  it("accepts a bare arm command", () => {
    expect(commandRequestSchema.safeParse({ type: "arm" }).success).toBe(true);
  });

  it("requires alt for takeoff", () => {
    expect(commandRequestSchema.safeParse({ type: "takeoff" }).success).toBe(false);
    expect(commandRequestSchema.safeParse({ type: "takeoff", alt: 10 }).success).toBe(true);
    expect(commandRequestSchema.safeParse({ type: "takeoff", alt: -1 }).success).toBe(false);
  });

  it("requires lat/lon/alt for goto", () => {
    expect(commandRequestSchema.safeParse({ type: "goto", lat: 1, lon: 2, alt: 3 }).success).toBe(true);
    expect(commandRequestSchema.safeParse({ type: "goto", lat: 1 }).success).toBe(false);
  });

  it("requires a mode string for set_mode", () => {
    expect(commandRequestSchema.safeParse({ type: "set_mode", mode: "GUIDED" }).success).toBe(true);
    expect(commandRequestSchema.safeParse({ type: "set_mode" }).success).toBe(false);
  });

  it("rejects an unknown command type", () => {
    expect(commandRequestSchema.safeParse({ type: "explode" }).success).toBe(false);
  });
});

describe("telemetryPostSchema", () => {
  const state = {
    v: 1,
    t: 1,
    armed: false,
    mode: "STABILIZE",
    sys: "STANDBY",
    bat: { pct: 100, v: 12.5, a: 0 },
    gps: { fix: 3, sats: 12, hdop: 0.9 },
    pos: { lat: 1, lon: 2, alt: 3, rel: 0 },
    hdg: 0,
    gs: 0,
    vs: 0,
    wp: { cur: 0, n: 0 },
    fw: "ArduCopter V4.5.7",
  };

  it("accepts a state with no history", () => {
    expect(telemetryPostSchema.safeParse({ state }).success).toBe(true);
  });

  it("rejects more than 60 history points", () => {
    const history = Array.from({ length: 61 }, () => state);
    expect(telemetryPostSchema.safeParse({ state, history }).success).toBe(false);
  });
});

describe("vehiclePatchSchema", () => {
  it("refuses an empty patch", () => {
    expect(vehiclePatchSchema.safeParse({}).success).toBe(false);
  });
  it("accepts a single field", () => {
    expect(vehiclePatchSchema.safeParse({ name: "Rover 1" }).success).toBe(true);
  });
});

describe("missionItemSchema", () => {
  it("requires a non-negative seq", () => {
    const base = { seq: 0, cur: 0, frame: 3, cmd: 16, p1: 0, p2: 0, p3: 0, p4: 0, lat: 0, lon: 0, alt: 0, ac: 1 };
    expect(missionItemSchema.safeParse(base).success).toBe(true);
    expect(missionItemSchema.safeParse({ ...base, seq: -1 }).success).toBe(false);
  });
});

describe("telemetryPostSchema (contract v2)", () => {
  // Captured from the companion's StateBuilder against the fake autopilot.
  const v2 = stateV2Fixture as Record<string, unknown>;

  it("accepts a real companion v2 snapshot and keeps fields it does not type", () => {
    const parsed = telemetryPostSchema.safeParse({ state: v2 });
    expect(parsed.success).toBe(true);
    const state = parsed.success ? (parsed.data.state as Record<string, unknown>) : {};
    expect(state.att).toEqual(v2.att);
    expect(state.ekf).toEqual(v2.ekf);
  });

  it("accepts nulls for everything unknown", () => {
    const blank = {
      v: 2,
      t: 1,
      fc: { ok: false, age: null, id: null },
      veh: null,
      armed: null,
      mode: null,
      sys: null,
      bat: null,
      gps: null,
      pos: null,
      hdg: null,
      gs: null,
      vs: null,
      wp: null,
      health: { prearm: null, bad: [], msgs: [] },
      caps: [],
      fw: null,
    };
    expect(telemetryPostSchema.safeParse({ state: blank }).success).toBe(true);
  });

  it("carries STATUSTEXT messages and caps their number", () => {
    const msg = { seq: 1, t: 1, sev: 2, text: "PreArm: GPS not healthy", comp: 1 };
    expect(telemetryPostSchema.safeParse({ state: v2, msgs: [msg] }).success).toBe(true);
    expect(telemetryPostSchema.safeParse({ state: v2, msgs: Array.from({ length: 51 }, () => msg) }).success).toBe(false);
    expect(telemetryPostSchema.safeParse({ state: v2, msgs: [{ ...msg, sev: 9 }] }).success).toBe(false);
  });

  it("rejects an oversized state", () => {
    const huge = { ...v2, junk: "x".repeat(20_000) };
    expect(telemetryPostSchema.safeParse({ state: huge }).success).toBe(false);
  });
});

describe("commandRequestSchema (ground-station commands)", () => {
  const ok = (body: unknown) => commandRequestSchema.safeParse(body).success;

  it("validates the new flight commands", () => {
    expect(ok({ type: "land" })).toBe(true);
    expect(ok({ type: "hold" })).toBe(true);
    expect(ok({ type: "change_speed", speed: 5 })).toBe(true);
    expect(ok({ type: "change_speed", speed: 0 })).toBe(false);
    expect(ok({ type: "change_alt", alt: 25 })).toBe(true);
    expect(ok({ type: "mission_set_current", seq: 3 })).toBe(true);
    expect(ok({ type: "mission_set_current", seq: 1.5 })).toBe(false);
    expect(ok({ type: "goto", lat: 95, lon: 0, alt: 10 })).toBe(false);
  });

  it("needs either current or a full position for set_home", () => {
    expect(ok({ type: "set_home", current: true })).toBe(true);
    expect(ok({ type: "set_home", lat: 25, lon: 121, alt: 10 })).toBe(true);
    expect(ok({ type: "set_home", lat: 25 })).toBe(false);
    expect(ok({ type: "set_home" })).toBe(false);
  });

  it("limits parameter commands to valid names and 50 entries", () => {
    expect(ok({ type: "param_get", names: ["FENCE_ENABLE", "SYSID_MYGCS"] })).toBe(true);
    expect(ok({ type: "param_get", names: ["fence_enable"] })).toBe(false);
    expect(ok({ type: "param_get", names: [] })).toBe(false);
    expect(ok({ type: "param_set", params: { FENCE_ENABLE: 1 } })).toBe(true);
    expect(ok({ type: "param_set", params: {} })).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`P${i}`, 1]));
    expect(ok({ type: "param_set", params: many })).toBe(false);
  });

  it("accepts a mission type for download and clear", () => {
    expect(ok({ type: "mission_download", mtype: 1 })).toBe(true);
    expect(ok({ type: "mission_clear", mtype: 2 })).toBe(true);
    expect(ok({ type: "mission_clear", mtype: 3 })).toBe(false);
  });
});
