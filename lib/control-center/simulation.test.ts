import { describe, expect, it } from "vitest";
import { tickMachine } from "./simulation";
import { CURRENT_ALARM_THRESHOLD, CURRENT_WARNING_THRESHOLD } from "./constants";
import type { Machine } from "./types";

// Jitter applied per tick is at most ±0.3A (see simulation.ts), so tests keep
// at least that much margin from a threshold to stay deterministic despite
// the random walk.
const JITTER_MARGIN = 0.3;

function baseMachine(overrides: Partial<Machine> = {}, now = Date.now()): Machine {
  return {
    id: "m1",
    name: "Machine 1",
    deviceId: "dev-1",
    storeId: "store-1",
    groupId: "group-1",
    status: "online",
    current: 3,
    door: "closed",
    doorOpenSince: null,
    heartbeatAt: now,
    rssi: -50,
    firmware: "v2.5.0",
    restartCount: 0,
    lastUpdate: now,
    currentHistory: [{ t: now, value: 3 }],
    ...overrides,
  };
}

describe("tickMachine", () => {
  it("crossing into alarm via high current emits a critical event and alert", () => {
    const now = Date.now();
    const machine = baseMachine({ current: CURRENT_ALARM_THRESHOLD + JITTER_MARGIN + 0.2, status: "online" }, now);

    const result = tickMachine(machine, now);

    expect(result.machine.status).toBe("alarm");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ severity: "critical", type: "high_current" });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({ severity: "critical", status: "active" });
  });

  it("crossing into warning via elevated current emits an event but no alert", () => {
    const now = Date.now();
    const current = (CURRENT_WARNING_THRESHOLD + CURRENT_ALARM_THRESHOLD) / 2;
    const machine = baseMachine({ current, status: "online" }, now);

    const result = tickMachine(machine, now);

    expect(result.machine.status).toBe("warning");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ severity: "warning", type: "high_current" });
    expect(result.alerts).toHaveLength(0);
  });

  it("recovering from alarm to online emits a back_online info event", () => {
    const now = Date.now();
    const machine = baseMachine({ current: 1, status: "alarm" }, now);

    const result = tickMachine(machine, now);

    expect(result.machine.status).toBe("online");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ severity: "info", type: "back_online" });
  });

  it("offline machines mostly stay unchanged tick to tick", () => {
    const now = Date.now();
    const machine = baseMachine({ status: "offline" }, now);

    let unchangedCount = 0;
    for (let i = 0; i < 200; i++) {
      const result = tickMachine(machine, now);
      if (result.machine === machine) unchangedCount++;
    }

    // ~97% no-op per simulation.ts; assert the large majority stayed put
    // rather than an exact count, since the underlying RNG isn't seeded per test.
    expect(unchangedCount).toBeGreaterThan(150);
  });
});
