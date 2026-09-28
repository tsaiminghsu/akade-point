import { describe, expect, it } from "vitest";

import stateV2Fixture from "../__fixtures__/state-v2.json";
import type { VehicleStateV2 } from "../types";
import { DEFAULT_LAYOUT, QUICK_FIELDS, fieldsFor, parseLayout, quickValue } from "./quickFields";

const base = stateV2Fixture as unknown as VehicleStateV2;

describe("quick panel fields", () => {
  it("every default field exists and applies to its vehicle type", () => {
    for (const fam of ["copter", "rover"] as const) {
      const keys = new Set(fieldsFor(fam).map((f) => f.key));
      for (const k of DEFAULT_LAYOUT[fam].fields) expect(keys.has(k)).toBe(true);
    }
    expect(new Set(QUICK_FIELDS.map((f) => f.key)).size).toBe(QUICK_FIELDS.length);
  });

  it("shows a dash, never 0, for unknown values", () => {
    for (const f of QUICK_FIELDS) expect(quickValue(f.key, null).value).toBe("—");
    expect(quickValue("cell", { ...base, bat: null }).value).toBe("—");
    expect(quickValue("nope", base).value).toBe("—");
  });

  it("formats and grades values", () => {
    expect(quickValue("groundspeed", { ...base, gs: 4.26 })).toEqual({ value: "4.3", unit: "m/s" });
    expect(quickValue("wpDist", { ...base, wp: { cur: 1, n: 3, dist: 1530, xt: 0 } })).toEqual({ value: "1.5", unit: "km" });
    expect(quickValue("ekf", { ...base, ekf: { ...base.ekf!, worst: 0.9 } }).tone).toBe("bad");
    expect(quickValue("piTemp", { ...base, comp: { ...base.comp!, tempC: 72 } }).tone).toBe("warn");
  });

  it("restores a stored layout, dropping unknown and rover-inapplicable fields", () => {
    expect(parseLayout(null, "copter")).toEqual(DEFAULT_LAYOUT.copter);
    expect(parseLayout("{bad json", "rover")).toEqual(DEFAULT_LAYOUT.rover);
    expect(parseLayout(JSON.stringify({ fields: ["alt", "sats", "gone", "sats"], columns: 2 }), "rover")).toEqual({ fields: ["sats"], columns: 2 });
    expect(parseLayout(JSON.stringify({ fields: ["alt"], columns: 7 }), "copter")).toEqual({ fields: ["alt"], columns: 3 });
    expect(parseLayout(JSON.stringify({ fields: ["alt"] }), "rover")).toEqual(DEFAULT_LAYOUT.rover);
  });
});
