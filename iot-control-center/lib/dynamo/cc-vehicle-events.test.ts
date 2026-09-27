import { describe, expect, it } from "vitest";

import { eventSortKey, toEvent } from "./cc-vehicle-events";
import { toPoint } from "./cc-vehicle-telemetry";
import stateV2Fixture from "@/lib/control-center/vehicles/__fixtures__/state-v2.json";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";

describe("eventSortKey", () => {
  it("sorts lexically in time order and keeps same-millisecond messages apart", () => {
    const a = eventSortKey(1_790_000_000_000, 7);
    const b = eventSortKey(1_790_000_000_000, 8);
    const c = eventSortKey(1_790_000_000_001, 1);
    expect([c, b, a].sort()).toEqual([a, b, c]);
    expect(a).not.toBe(b);
  });

  it("stamps a 7-day expiry from the message time", () => {
    const e = toEvent("v1", { seq: 1, t: 1_000_000, sev: 2, text: "PreArm: x", comp: 1 });
    expect(e.expiresAt).toBe(1000 + 7 * 24 * 3600);
    expect(e.sk).toBe(eventSortKey(1_000_000, 1));
  });
});

describe("toPoint", () => {
  it("skips a v2 snapshot without a position", () => {
    const s = { ...(stateV2Fixture as unknown as VehicleStateV2), pos: null };
    expect(toPoint("v1", s)).toBeNull();
  });

  it("keeps unknown readings as null", () => {
    const s = { ...(stateV2Fixture as unknown as VehicleStateV2), bat: null, gps: null };
    const p = toPoint("v1", s)!;
    expect(p.lat).toBe(25.033);
    expect(p.batPct).toBeNull();
    expect(p.sats).toBeNull();
  });
});
