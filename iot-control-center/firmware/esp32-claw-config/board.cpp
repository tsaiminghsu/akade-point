#include "board.h"

#if defined(BOARD_LOG_ONLY) == defined(BOARD_UART)
#error "Define exactly one of BOARD_LOG_ONLY or BOARD_UART in board.h"
#endif

static String formatValue(uint8_t i, float value) {
  return String(value, (unsigned int)settingDecimals(SETTING_SPECS[i]));
}

#if defined(BOARD_LOG_ONLY)

void boardSetup() {}

bool applyToBoard(const ClawBoardSettings& s, String& code, String& msg) {
  Serial.println("[board] applying settings:");
  for (uint8_t i = 0; i < SETTING_COUNT; i++) {
    const SettingSpec& spec = SETTING_SPECS[i];
    Serial.printf("  %-3s %-15s %6s %s\n", spec.code, spec.key, formatValue(i, s.v[i]).c_str(), spec.unit);
  }
  return true;
}

#elif defined(BOARD_UART)

void boardSetup() {
  Serial2.begin(BOARD_UART_BAUD, SERIAL_8N1, BOARD_UART_RX, BOARD_UART_TX);
  Serial2.setTimeout(BOARD_UART_TIMEOUT_MS);
}

/** Keep only what the Control Center accepts as a failure code. */
static String cleanCode(const String& raw) {
  String out;
  for (size_t i = 0; i < raw.length() && out.length() < 32; i++) {
    const char c = raw[i];
    if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') out += c;
  }
  return out.length() ? out : String("BOARD_REJECTED");
}

bool applyToBoard(const ClawBoardSettings& s, String& code, String& msg) {
  while (Serial2.available()) Serial2.read();  // drop anything stale
  for (uint8_t i = 0; i < SETTING_COUNT; i++) {
    Serial2.printf("SET %s %s\n", SETTING_SPECS[i].key, formatValue(i, s.v[i]).c_str());
  }
  Serial2.print("COMMIT\n");

  String reply = Serial2.readStringUntil('\n');
  reply.trim();
  if (reply == "OK") return true;
  if (reply.length() == 0) {
    code = "BOARD_TIMEOUT";
    msg = "no reply to COMMIT";
    return false;
  }
  if (reply.startsWith("ERR")) {
    const String rest = reply.substring(3);
    const int space = rest.indexOf(' ', 1);
    code = cleanCode(space > 0 ? rest.substring(0, space) : rest);
    msg = space > 0 ? rest.substring(space + 1) : String();
    return false;
  }
  code = "BOARD_BAD_REPLY";
  msg = reply.substring(0, 60);
  return false;
}

#endif
