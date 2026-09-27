import { describe, expect, it } from "vitest";

import stateV2Fixture from "./__fixtures__/state-v2.json";
import { fixLabel, summarize } from "./summary";
import type { VehicleStateV1, VehicleStateV2 } from "./types";

const v1: VehicleStateV1 = {
  v: 1,
  t: 1,
  armed: true,
  mode: "AUTO",
  sys: "ACTIVE",
  bat: { pct: 80, v: 15.9, a: 12 },
  gps: { fix: 3, sats: 12, hdop: 0.9 },
  pos: { lat: 25, lon: 121, alt: 30, rel: 18 },
  hdg: 90,
  gs: 5,
  vs: 0.5,
  wp: { cur: 2, n: 6 },
  fw: "ArduCopter V4.5.7",
};

describe("summarize", () => {
  it("reads a v1 snapshot", () => {
    const s = summarize(v1)!;
    expect(s).toMatchObject({ armed: true, mode: "AUTO", batPct: 80, batV: 15.9, fix: 3, sats: 12, fcOk: true });
    expect(s.pos).toEqual(v1.pos);
  });

  it("treats v1 placeholders as unknown", () => {
    const s = summarize({ ...v1, mode: "UNKNOWN", fw: "unknown", pos: { lat: 0, lon: 0, alt: 0, rel: 0 }, bat: { pct: 0, v: 0, a: 0 } })!;
    expect(s.mode).toBeNull();
    expect(s.fw).toBeNull();
    expect(s.pos).toBeNull();
    expect(s.batV).toBeNull();
  });

  it("reads a v2 snapshot", () => {
    const s = summarize(stateV2Fixture as unknown as VehicleStateV2)!;
    expect(s).toMatchObject({ armed: false, mode: "STABILIZE", fix: 3, sats: 14, fw: "ArduCopter V4.5.7", fcOk: true });
    expect(s.pos?.lat).toBe(25.033);
  });

  it("passes v2 nulls through instead of inventing zeros", () => {
    const blank = { ...(stateV2Fixture as unknown as VehicleStateV2), fc: { ok: false, age: null, id: null }, bat: null, gps: null, pos: null, wp: null };
    const s = summarize(blank)!;
    expect(s.batPct).toBeNull();
    expect(s.fix).toBeNull();
    expect(s.pos).toBeNull();
    expect(s.wp).toBeNull();
    expect(s.fcOk).toBe(false);
  });

  it("returns null for no state", () => {
    expect(summarize(null)).toBeNull();
  });
});

describe("fixLabel", () => {
  it("names fix types", () => {
    expect(fixLabel(null)).toBeNull();
    expect(fixLabel(0)).toBe("No fix");
    expect(fixLabel(3)).toBe("3D");
    expect(fixLabel(6)).toBe("RTK");
  });
});
