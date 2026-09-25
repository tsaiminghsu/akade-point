import { describe, expect, it } from "vitest";

import {
  defaultDraft,
  describeChange,
  describeClaw,
  diffDrafts,
  factoryConfig,
  hasChanges,
  mergeParts,
  sameDraft,
  sanitizeDraft,
  sanitizeRig,
  toClawConfig,
  type ClawDraft,
} from "./config";
import { clawConfigCopySchema, clawConfigPutSchema } from "./schemas";

function draft(patch: { settings?: Record<string, number>; rig?: Record<string, unknown> } = {}): ClawDraft {
  const base = defaultDraft();
  return sanitizeDraft({
    settings: { ...base.settings, ...patch.settings },
    rig: { ...base.rig, ...patch.rig },
  });
}

describe("sanitizeRig", () => {
  it("falls back to the factory rig for junk", () => {
    expect(sanitizeRig(null)).toEqual(defaultDraft().rig);
    expect(sanitizeRig("nope")).toEqual(defaultDraft().rig);
  });

  it("rejects inherited property names as claw types", () => {
    expect(sanitizeRig({ claw: "constructor" }).claw).toBe("standard");
    expect(sanitizeRig({ claw: "toString" }).claw).toBe("standard");
    expect(sanitizeRig({ claw: "kingkong" }).claw).toBe("kingkong");
  });

  it("migrates the old jumbo claw to a 6號 straight claw", () => {
    const rig = sanitizeRig({ claw: "jumbo" });
    expect(rig.claw).toBe("standard");
    expect(rig.fit.size).toBe("6");
    expect(rig.fit.bend).toBe("straight");
  });

  it("clamps the chute and stock into range", () => {
    const rig = sanitizeRig({ chute: { width: 9, depth: -1, wallH: 0.1234 }, stock: { count: 99999, categories: ["plush", "bogus"] } });
    expect(rig.chute.width).toBe(0.3);
    expect(rig.chute.depth).toBe(0.12);
    expect(rig.chute.wallH).toBe(0.12);
    expect(rig.stock.count).toBe(200);
    expect(rig.stock.categories).toEqual(["plush"]);
  });
});

describe("sameDraft / diffDrafts", () => {
  it("treats a round-tripped config as unchanged", () => {
    const a = draft();
    const b = JSON.parse(JSON.stringify(a));
    expect(sameDraft(a, b)).toBe(true);
    expect(hasChanges(diffDrafts(a, b))).toBe(false);
  });

  it("ignores category order, which sanitizing normalises", () => {
    const a = draft({ rig: { stock: { categories: ["plush", "capsule"], count: 60, random: false, countMin: 20 } } });
    const b = draft({ rig: { stock: { categories: ["capsule", "plush"], count: 60, random: false, countMin: 20 } } });
    expect(sameDraft(a, b)).toBe(true);
  });

  it("lists changed settings in board order, with codes", () => {
    const change = diffDrafts(draft(), draft({ settings: { dropLine: 2.5, strongPower: 35 } }));
    expect(change.settings.map((c) => c.code)).toEqual(["V1", "A2"]);
    expect(change.settings[0]).toMatchObject({ key: "strongPower", from: 40, to: 35 });
    expect(change.rig).toEqual([]);
  });

  it("reports which rig parts changed", () => {
    const change = diffDrafts(draft(), draft({ rig: { claw: "four", chute: { width: 0.2, depth: 0.22, wallH: 0.15 } } }));
    expect(change.rig).toEqual(["claw", "chute"]);
  });

  it("counts an out-of-range value that clamps back to the saved one as no change", () => {
    const saved = draft({ settings: { strongPower: 48 } });
    expect(sameDraft(saved, draft({ settings: { strongPower: 500 } }))).toBe(true);
  });
});

describe("describeChange", () => {
  it("formats settings with units and names rig parts", () => {
    const text = describeChange(diffDrafts(draft(), draft({ settings: { strongPower: 35 }, rig: { claw: "four" } })));
    expect(text).toBe("V1 強電壓 40.0 V→35.0 V；爪子");
  });

  it("abbreviates long lists", () => {
    const next = draft({
      settings: { coinsPerPlay: 2, playTime: 20, guaranteeN: 5, strongPower: 30, midPower: 20, weakPower: 5, dropLine: 3 },
    });
    const text = describeChange(diffDrafts(draft(), next));
    expect(text).toContain("等 7 項");
    expect(text).not.toContain("A2");
  });

  it("says so when nothing changed", () => {
    expect(describeChange(diffDrafts(draft(), draft()))).toBe("無變更");
  });
});

describe("configs", () => {
  it("gives unsaved machines revision 0 and factory values", () => {
    const cfg = factoryConfig("m1");
    expect(cfg.revision).toBe(0);
    expect(sameDraft(cfg, defaultDraft())).toBe(true);
  });

  it("normalises a stored row", () => {
    const cfg = toClawConfig({ machineId: "m1", settings: { strongPower: 100, junk: 1 }, rig: { claw: "two" }, revision: 3, updatedAt: 5, updatedBy: "u" });
    expect(cfg.settings.strongPower).toBe(48);
    expect("junk" in cfg.settings).toBe(false);
    expect(cfg.rig.claw).toBe("two");
    expect(cfg.revision).toBe(3);
  });

  it("merges only the chosen parts", () => {
    const target = draft({ settings: { strongPower: 20 }, rig: { claw: "two" } });
    const source = draft({ settings: { strongPower: 44 }, rig: { claw: "kingkong" } });
    expect(mergeParts(target, source, ["settings"])).toEqual({ settings: source.settings, rig: target.rig });
    expect(mergeParts(target, source, ["rig"])).toEqual({ settings: target.settings, rig: source.rig });
  });

  it("describes the fitted claw", () => {
    expect(describeClaw(defaultDraft().rig)).toBe("標準三爪 4號 彎爪 100%");
  });
});

describe("schemas", () => {
  it("accepts a sanitized draft with a revision", () => {
    expect(clawConfigPutSchema.safeParse({ ...defaultDraft(), revision: 0 }).success).toBe(true);
  });

  it("rejects non-numeric settings and a missing revision", () => {
    expect(clawConfigPutSchema.safeParse({ ...defaultDraft() }).success).toBe(false);
    const bad = { ...defaultDraft(), revision: 1, settings: { strongPower: "40" } };
    expect(clawConfigPutSchema.safeParse(bad).success).toBe(false);
  });

  it("requires at least one part and one target for a copy", () => {
    const base = { ...defaultDraft(), parts: ["settings"], machineIds: ["m1"] };
    expect(clawConfigCopySchema.safeParse(base).success).toBe(true);
    expect(clawConfigCopySchema.safeParse({ ...base, parts: [] }).success).toBe(false);
    expect(clawConfigCopySchema.safeParse({ ...base, parts: ["everything"] }).success).toBe(false);
    expect(clawConfigCopySchema.safeParse({ ...base, machineIds: [] }).success).toBe(false);
  });
});
