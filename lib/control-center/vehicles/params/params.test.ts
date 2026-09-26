import { describe, expect, it } from "vitest";

import {
  bitLabels,
  checkValue,
  chunk,
  configChecks,
  diffParams,
  formatValue,
  parseParamFile,
  serializeParamFile,
  stripParamMeta,
} from "./params";

describe("parameter files", () => {
  it("reads Mission Planner and QGroundControl formats and skips comments", () => {
    const mp = "# saved\nBATT_LOW_VOLT,14.2\nFENCE_ENABLE 1\n\nbad line here\n";
    const r = parseParamFile(mp);
    expect(r.values).toEqual({ BATT_LOW_VOLT: 14.2, FENCE_ENABLE: 1 });
    expect(r.bad).toEqual([5]);
    const qgc = "# Onboard parameters\n1\t1\tRTL_ALT\t1500\t6\r\n1\t1\tWPNAV_SPEED\t500.000000000000000000\t9\r\n";
    expect(parseParamFile(qgc).values).toEqual({ RTL_ALT: 1500, WPNAV_SPEED: 500 });
  });

  it("writes Mission Planner format without float32 noise", () => {
    expect(serializeParamFile({ Z_P: 1, A_P: Math.fround(0.1) }, "vehicle x")).toBe("# vehicle x\nA_P,0.1\nZ_P,1\n");
    expect(formatValue(Math.fround(14.1))).toBe("14.1");
    const round = parseParamFile(serializeParamFile({ X: 3.25, Y: -1 })).values;
    expect(round).toEqual({ X: 3.25, Y: -1 });
  });
});

describe("parameter metadata", () => {
  const pdef = {
    FENCE_: {
      FENCE_TYPE: { DisplayName: "Fence Type", Description: "bits", Bitmask: { "0": "Max altitude", "2": "Polygon" } },
      FENCE_ACTION: { DisplayName: "Action", Values: { "0": "Report", "1": "RTL" } },
    },
    BATT_: { BATT_LOW_VOLT: { DisplayName: "Low voltage", Units: "V", Range: { low: "0", high: "100" }, Increment: "0.1" } },
    "": { SYSID_THISMAV: { DisplayName: "System ID", RebootRequired: "True", User: "Advanced" } },
  };
  const meta = stripParamMeta(pdef);

  it("flattens libraries into one table", () => {
    expect(Object.keys(meta).sort()).toEqual(["BATT_LOW_VOLT", "FENCE_ACTION", "FENCE_TYPE", "SYSID_THISMAV"]);
    expect(meta.BATT_LOW_VOLT).toMatchObject({ units: "V", range: [0, 100], incr: 0.1 });
    expect(meta.SYSID_THISMAV).toMatchObject({ reboot: true, advanced: true });
  });

  it("checks values against range, list and bitmask", () => {
    expect(checkValue(meta.BATT_LOW_VOLT, 120)).toBe("aboveRange");
    expect(checkValue(meta.FENCE_ACTION, 7)).toBe("notInList");
    expect(checkValue(meta.FENCE_ACTION, 1)).toBeNull();
    expect(checkValue(meta.FENCE_TYPE, 1.5)).toBe("notInteger");
    expect(checkValue(undefined, 5)).toBeNull();
    expect(bitLabels(meta.FENCE_TYPE, 5)).toEqual(["Max altitude", "Polygon"]);
  });
});

describe("compare", () => {
  it("lists differences and one-sided parameters, ignoring float32 noise", () => {
    const d = diffParams({ A: 1, B: Math.fround(0.1), C: 3 }, { A: 2, B: 0.1, D: 4 });
    expect(d).toEqual([
      { name: "A", current: 1, other: 2 },
      { name: "C", current: 3, other: null },
      { name: "D", current: null, other: 4 },
    ]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("configuration checks", () => {
  const keys = (i: { key: string }[]) => i.map((x) => x.key);

  it("warns when the operator heartbeat cannot be recognised by the failsafe", () => {
    expect(keys(configChecks({ SYSID_MYGCS: 255, FS_GCS_ENABLE: 1 }, { sysid: 253, policy: "operator" }))).toContain("operatorSysid");
    expect(keys(configChecks({ MAV_GCS_SYSID: 253, SYSID_MYGCS: 255, FS_GCS_ENABLE: 1 }, { sysid: 253, policy: "operator" }))).not.toContain("operatorSysid");
    expect(keys(configChecks({ SYSID_MYGCS: 253, FS_GCS_ENABLE: 0 }, { sysid: 253, policy: "operator" }))).toContain("operatorNoFs");
    expect(keys(configChecks({ SYSID_MYGCS: 253, FS_GCS_ENABLE: 1 }, { sysid: 253, policy: "always" }))).toContain("alwaysMasks");
  });

  it("points out missing protections and gimbal setup, and ignores absent parameters", () => {
    const issues = keys(configChecks({ BATT_MONITOR: 0, ARMING_CHECK: 0, FENCE_ENABLE: 0, FS_THR_ENABLE: 0, MNT1_TYPE: 4, SERIAL2_PROTOCOL: 1 }, { sysid: 253, policy: "off" }));
    expect(issues).toEqual(expect.arrayContaining(["noBattery", "armingOff", "fenceOff", "rcFsOff", "storm32Mavlink", "telem2NotMavlink2"]));
    expect(configChecks({}, { sysid: 253, policy: "off" })).toEqual([]);
  });
});
