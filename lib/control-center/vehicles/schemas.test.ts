import { describe, expect, it } from "vitest";

import {
  commandRequestSchema,
  missionItemSchema,
  telemetryPostSchema,
  vehiclePatchSchema,
} from "./schemas";

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
