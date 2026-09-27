import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SETTING_DEFS } from "@/components/control-center/claw-machine/game/settings";

// The ESP32 firmware keeps its own copy of the settings table (C++ can't
// import settings.ts). This test is what keeps the two from drifting.
const header = readFileSync(
  fileURLToPath(new URL("../../../firmware/esp32-claw-config/claw_settings.h", import.meta.url)),
  "utf8"
);

const rows = [...header.matchAll(/^\s*\{"(\w+)",\s*"(\w+)",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*"[^"]*"\},/gm)].map(
  (m) => ({ key: m[1], code: m[2], min: Number(m[3]), max: Number(m[4]), step: Number(m[5]), def: Number(m[6]) })
);

const enumBody = header.match(/enum SettingId : uint8_t \{([\s\S]*?)\};/)?.[1] ?? "";
const enumIds = enumBody
  .replace(/\/\/.*$/gm, "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

describe("ESP32 settings table", () => {
  it("lists every setting, in the same order, with the same code, range, step and default", () => {
    expect(rows).toEqual(
      SETTING_DEFS.map((d) => ({ key: d.key, code: d.code, min: d.min, max: d.max, step: d.step, def: d.default }))
    );
  });

  it("has one SettingId per row, ending in SETTING_COUNT", () => {
    expect(enumIds.at(-1)).toBe("SETTING_COUNT");
    expect(enumIds.length - 1).toBe(SETTING_DEFS.length);
    // Enum names are the keys in SCREAMING_SNAKE_CASE.
    const expected = SETTING_DEFS.map((d) => d.key.replace(/([A-Z])/g, "_$1").toUpperCase());
    expect(enumIds.slice(0, -1)).toEqual(expected);
  });
});
