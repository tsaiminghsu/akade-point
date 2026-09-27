#pragma once
// Board settings as the Control Center sends them
// (GET /api/device/machines/config, contract v1).
//
// SETTING_SPECS mirrors SETTING_DEFS in
// components/control-center/claw-machine/game/settings.ts: same keys, codes,
// ranges, steps and defaults, in the same order.
// lib/control-center/claw/firmware.test.ts fails if the two drift apart, so
// change both together.

#include <Arduino.h>
#include <ArduinoJson.h>

enum SettingId : uint8_t {
  // 基本設定
  COINS_PER_PLAY, PLAY_TIME, PAYOUT_MODE, GUARANTEE_N, RESET_ON_WIN,
  AUTO_DROP, MID_AIR_GRAB, DROP_STEER, IDLE_OPEN,
  // 爪力電壓
  STRONG_POWER, MID_POWER, MID_POINT, WEAK_POWER, GUARANTEE_POWER,
  // 爪子動作
  DROP_DELAY, DROP_LINE, CLOSE_DELAY, LIFT_DELAY, TOP_DELAY, TOP_PULL, HOME_DROP,
  // 馬達速度
  GANTRY_SPEED, DROP_SPEED, UP_SPEED,
  SETTING_COUNT
};

struct SettingSpec {
  const char* key;   // JSON key
  const char* code;  // item code on the setup page (01, V1, A1, E1...)
  float min;
  float max;
  float step;
  float def;
  const char* unit;  // ASCII, for serial logs
};

static const SettingSpec SETTING_SPECS[SETTING_COUNT] = {
  // key                code   min   max   step  default unit
  {"coinsPerPlay",    "01",  1,    10,   1,    1,    "coin"},
  {"playTime",        "02",  10,   60,   1,    30,   "s"},
  {"payoutMode",      "03",  0,    1,    1,    0,    "0=guarantee 1=chance"},
  {"guaranteeN",      "04",  0,    50,   1,    10,   "plays"},
  {"resetOnWin",      "05",  0,    1,    1,    1,    "bool"},
  {"autoDrop",        "06",  0,    1,    1,    1,    "bool"},
  {"midAirGrab",      "07",  0,    1,    1,    1,    "bool"},
  {"dropSteer",       "08",  0,    1,    1,    1,    "bool"},
  {"idleOpen",        "09",  0,    1,    1,    0,    "0=closed 1=open"},
  {"strongPower",     "V1",  0,    48,   0.5,  40,   "V"},
  {"midPower",        "V2",  0,    48,   0.5,  30,   "V"},
  {"midPoint",        "V3",  1,    30,   1,    10,   "1=top 30=bottom"},
  {"weakPower",       "V4",  0,    48,   0.5,  12,   "V"},
  {"guaranteePower",  "V5",  0,    48,   0.5,  48,   "V"},
  {"dropDelay",       "A1",  0,    1,    0.05, 0,    "s"},
  {"dropLine",        "A2",  0.2,  4,    0.1,  2,    "s"},
  {"closeDelay",      "A3",  0,    1,    0.05, 0,    "s"},
  {"liftDelay",       "A4",  0,    2,    0.05, 0.25, "s"},
  {"topDelay",        "A5",  0,    2,    0.1,  0.5,  "s"},
  {"topPull",         "A6",  0,    10,   1,    2,    "seg"},
  {"homeDrop",        "A7",  0,    10,   1,    0,    "seg"},
  {"gantrySpeed",     "E1",  1,    10,   1,    6,    "level"},
  {"dropSpeed",       "E2",  1,    10,   1,    6,    "level"},
  {"upSpeed",         "E3",  1,    10,   1,    6,    "level"},
};

struct ClawBoardSettings {
  float v[SETTING_COUNT];
  float operator[](SettingId id) const { return v[id]; }
};

inline void defaultSettings(ClawBoardSettings& s) {
  for (uint8_t i = 0; i < SETTING_COUNT; i++) s.v[i] = SETTING_SPECS[i].def;
}

/** Decimal places worth printing for an item (whole numbers for 1-steps). */
inline uint8_t settingDecimals(const SettingSpec& spec) {
  return spec.step >= 1 ? 0 : spec.step >= 0.1f ? 1 : 2;
}

/**
 * Fingerprint of the table layout, stored next to the saved values so a
 * firmware whose table changed never reads old values into the wrong items.
 */
inline uint32_t settingsLayoutHash() {
  uint32_t h = 2166136261u;  // FNV-1a
  for (uint8_t i = 0; i < SETTING_COUNT; i++) {
    for (const char* p = SETTING_SPECS[i].key; *p; p++) {
      h ^= (uint8_t)*p;
      h *= 16777619u;
    }
    h ^= ';';
    h *= 16777619u;
  }
  return h;
}

/**
 * Read every item from the payload's `settings` object. A missing item, a
 * non-number or a value outside its range is an error: the server clamps
 * before sending, so any of those means firmware and server disagree about
 * the contract, and the board should keep running what it has.
 */
inline bool parseSettings(JsonObjectConst obj, ClawBoardSettings& out, String& code, String& msg) {
  if (obj.isNull()) {
    code = "BAD_PAYLOAD";
    msg = "no settings object";
    return false;
  }
  for (uint8_t i = 0; i < SETTING_COUNT; i++) {
    const SettingSpec& spec = SETTING_SPECS[i];
    JsonVariantConst value = obj[spec.key];
    if (value.isNull() || !(value.is<float>() || value.is<long>())) {
      code = "MISSING_SETTING";
      msg = spec.key;
      return false;
    }
    const float x = value.as<float>();
    if (x < spec.min - 1e-4f || x > spec.max + 1e-4f) {
      code = "OUT_OF_RANGE";
      msg = String(spec.key) + "=" + String(x, 2);
      return false;
    }
    out.v[i] = x;
  }
  return true;
}
