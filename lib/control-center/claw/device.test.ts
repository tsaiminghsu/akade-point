import { describe, expect, it } from "vitest";

import { defaultDraft, factoryConfig } from "./config";
import {
  DEVICE_OFFLINE_MS,
  PULL_RECORD_INTERVAL_MS,
  cleanFirmware,
  cyrb53,
  deliveryState,
  etagFor,
  matchesEtag,
  settingsSha,
  shouldRecordPull,
  toDevicePayload,
  type ClawSync,
} from "./device";
import { deviceAckSchema } from "./schemas";

const factory = defaultDraft().settings;

describe("settingsSha", () => {
  it("is 14 hex digits and stable", () => {
    const sha = settingsSha(factory);
    expect(sha).toMatch(/^[0-9a-f]{14}$/);
    expect(settingsSha({ ...factory })).toBe(sha);
  });

  it("changes with any setting", () => {
    expect(settingsSha({ ...factory, strongPower: 39.5 })).not.toBe(settingsSha(factory));
    expect(settingsSha({ ...factory, homeDrop: 1 })).not.toBe(settingsSha(factory));
  });

  it("ignores key order and values that clamp to the same setting", () => {
    const reversed = Object.fromEntries(Object.entries(factory).reverse()) as typeof factory;
    expect(settingsSha(reversed)).toBe(settingsSha(factory));
    expect(settingsSha({ ...factory, strongPower: 480 })).toBe(settingsSha({ ...factory, strongPower: 48 }));
  });

  it("matches the reference cyrb53 values", () => {
    // Published test vectors for cyrb53 with seed 0.
    expect(cyrb53("a")).toBe(7929297801672961);
    expect(cyrb53("b")).toBe(8684336938537663);
  });
});

describe("toDevicePayload", () => {
  it("sends only the board settings, with sha and poll", () => {
    const cfg = { ...factoryConfig("m1"), revision: 3 };
    const p = toDevicePayload(cfg);
    expect(p).toMatchObject({ v: 1, machineId: "m1", rev: 3, sha: settingsSha(cfg.settings) });
    expect(p.poll).toBeGreaterThan(0);
    expect(Object.keys(p.settings)).toHaveLength(24);
    expect("rig" in p).toBe(false);
  });

  it("stays small enough for a fixed ESP32 buffer", () => {
    expect(JSON.stringify(toDevicePayload(factoryConfig("m1".repeat(12)))).length).toBeLessThan(1024);
  });
});

describe("matchesEtag", () => {
  const sha = "00abcdef123456";
  it("accepts quoted, weak, bare, listed and wildcard tags", () => {
    expect(matchesEtag(etagFor(sha), sha)).toBe(true);
    expect(matchesEtag(`W/"${sha}"`, sha)).toBe(true);
    expect(matchesEtag(sha, sha)).toBe(true);
    expect(matchesEtag(`"other", "${sha}"`, sha)).toBe(true);
    expect(matchesEtag("*", sha)).toBe(true);
  });
  it("rejects a missing or different tag", () => {
    expect(matchesEtag(null, sha)).toBe(false);
    expect(matchesEtag('"other"', sha)).toBe(false);
  });
});

describe("cleanFirmware", () => {
  it("keeps printable ASCII, capped at 40", () => {
    expect(cleanFirmware("claw-esp32/1.0.0")).toBe("claw-esp32/1.0.0");
    expect(cleanFirmware("x\u0000yéz")).toBe("xyz");
    expect(cleanFirmware("a".repeat(60))).toHaveLength(40);
    expect(cleanFirmware("   ")).toBeUndefined();
    expect(cleanFirmware(null)).toBeUndefined();
  });
});

describe("shouldRecordPull", () => {
  const now = 10_000_000;
  const prev: ClawSync = { machineId: "m1", pulledAt: now - 1000, pulledSha: "aa", fw: "1.0" };
  it("records the first pull, a new sha or a new firmware", () => {
    expect(shouldRecordPull(null, "aa", undefined, now)).toBe(true);
    expect(shouldRecordPull(prev, "bb", "1.0", now)).toBe(true);
    expect(shouldRecordPull(prev, "aa", "1.1", now)).toBe(true);
  });
  it("skips a repeat pull until the record interval passes", () => {
    expect(shouldRecordPull(prev, "aa", "1.0", now)).toBe(false);
    expect(shouldRecordPull(prev, "aa", undefined, now)).toBe(false);
    expect(shouldRecordPull(prev, "aa", "1.0", now - 1000 + PULL_RECORD_INTERVAL_MS)).toBe(true);
  });
});

describe("deliveryState", () => {
  const now = 50_000_000;
  const sha = "saved";
  const base: ClawSync = { machineId: "m1", pulledAt: now - 1000, pulledSha: sha };

  it("is never without a pull", () => {
    expect(deliveryState(sha, undefined, now)).toEqual({ state: "never", online: false });
    expect(deliveryState(sha, { machineId: "m1" }, now).state).toBe("never");
  });

  it("is applied once the board reports the saved sha, even if it went quiet later", () => {
    expect(deliveryState(sha, { ...base, appliedSha: sha }, now)).toEqual({ state: "applied", online: true });
    const quiet = { ...base, appliedSha: sha, pulledAt: now - DEVICE_OFFLINE_MS - 1 };
    expect(deliveryState(sha, quiet, now)).toEqual({ state: "applied", online: false });
  });

  it("is failed when the board rejected the saved sha", () => {
    const failed = { ...base, appliedSha: "old", lastAck: { st: "failed" as const, sha, rev: 2, code: "RANGE", msg: "", t: now } };
    expect(deliveryState(sha, failed, now).state).toBe("failed");
    // A failure on an older config doesn't count against the new one.
    expect(deliveryState("newer", failed, now).state).toBe("pending");
  });

  it("is pending while polling and offline once it stops", () => {
    expect(deliveryState(sha, { ...base, appliedSha: "old" }, now).state).toBe("pending");
    const gone = { ...base, appliedSha: "old", pulledAt: now - DEVICE_OFFLINE_MS };
    expect(deliveryState(sha, gone, now)).toEqual({ state: "offline", online: false });
  });
});

describe("deviceAckSchema", () => {
  const ok = { v: 1, sha: "00abcdef123456", rev: 2, st: "applied" };
  it("accepts applied and failed reports", () => {
    expect(deviceAckSchema.safeParse(ok).success).toBe(true);
    expect(deviceAckSchema.safeParse({ ...ok, st: "failed", code: "OUT_OF_RANGE", msg: "strongPower" }).success).toBe(true);
  });
  it("rejects bad versions, shas, codes and long messages", () => {
    expect(deviceAckSchema.safeParse({ ...ok, v: 2 }).success).toBe(false);
    expect(deviceAckSchema.safeParse({ ...ok, sha: "NOT-HEX" }).success).toBe(false);
    expect(deviceAckSchema.safeParse({ ...ok, st: "failed", code: "lower case" }).success).toBe(false);
    expect(deviceAckSchema.safeParse({ ...ok, msg: "x".repeat(201) }).success).toBe(false);
    expect(deviceAckSchema.safeParse({ ...ok, st: "done" }).success).toBe(false);
  });
});
