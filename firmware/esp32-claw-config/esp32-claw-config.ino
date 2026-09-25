// Claw machine config puller for ESP32 (Arduino core 2.x, ArduinoJson 7).
//
// Every `poll` seconds (the server says how many) it asks the Control Center
// for this machine's board settings, with If-None-Match set to the last
// config it processed, so an unchanged config costs a 304 and no parsing.
// A new config is checked, handed to the machine (board.cpp), saved to flash
// and reported back as applied or failed. On boot the last applied config is
// re-applied from flash, so the machine keeps its settings with no network.
//
// Setup: copy secrets.example.h to secrets.h and fill it in; pick the board
// integration in board.h. Protocol: docs/claw-machine-esp32.md.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>

#include "secrets.h"
#include "claw_settings.h"
#include "board.h"

#define FW_VERSION "claw-esp32/1.0.0"

static const uint32_t DEFAULT_POLL_S = 30;
static const uint32_t MIN_POLL_S = 10;
static const uint32_t MAX_POLL_S = 3600;
/** Longest wait between attempts while the server is unreachable. */
static const uint32_t MAX_BACKOFF_S = 600;
static const char* NVS_NAMESPACE = "clawcfg";

static Preferences prefs;
static ClawBoardSettings current;
static String appliedSha;      // saved in flash with the values
static uint32_t appliedRev = 0;
/** Sent as If-None-Match: the last config processed, applied or rejected. */
static String lastSeenSha;
static uint32_t pollSeconds = DEFAULT_POLL_S;
static uint32_t nextPollAt = 0;
static uint8_t failures = 0;

/** A report not yet delivered; retried after every poll until the server takes it. */
static struct {
  bool due = false;
  String sha;
  uint32_t rev = 0;
  bool applied = false;
  String code;
  String msg;
} pendingAck;

// ── Flash ────────────────────────────────────────────────────────────────────

static bool loadSaved() {
  prefs.begin(NVS_NAMESPACE, true);
  const bool ok = prefs.getUInt("layout", 0) == settingsLayoutHash() &&
                  prefs.getBytesLength("vals") == sizeof(current.v);
  if (ok) {
    prefs.getBytes("vals", current.v, sizeof(current.v));
    appliedSha = prefs.getString("sha", "");
    appliedRev = prefs.getUInt("rev", 0);
  }
  prefs.end();
  return ok && appliedSha.length() > 0;
}

static void save() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putBytes("vals", current.v, sizeof(current.v));
  prefs.putUInt("layout", settingsLayoutHash());
  prefs.putString("sha", appliedSha);
  prefs.putUInt("rev", appliedRev);
  prefs.end();
}

// ── Network ──────────────────────────────────────────────────────────────────

static bool isHttps() { return strncmp(API_BASE, "https://", 8) == 0; }

static bool hasRootCa() { return strstr(ROOT_CA, "BEGIN CERTIFICATE") != nullptr; }

/** TLS certificate checks need the real time. */
static void syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  for (int i = 0; i < 20 && time(nullptr) < 1700000000; i++) delay(500);
  Serial.printf("[net] clock %s\n", time(nullptr) >= 1700000000 ? "synced" : "NOT synced (TLS may fail)");
}

static bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("[net] connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[net] Wi-Fi not connected");
    return false;
  }
  Serial.printf("[net] %s\n", WiFi.localIP().toString().c_str());
  if (isHttps()) syncClock();
  return true;
}

/** Opens `path` on API_BASE with the device headers, over TLS when API_BASE is https. */
static bool beginRequest(HTTPClient& http, WiFiClientSecure& tls, WiFiClient& plain, const char* path) {
  const String url = String(API_BASE) + path;
  bool ok;
  if (isHttps()) {
    if (hasRootCa()) {
      tls.setCACert(ROOT_CA);
    } else {
#ifdef ALLOW_INSECURE_TLS
      tls.setInsecure();
#else
      Serial.println("[net] API_BASE is https but secrets.h has no ROOT_CA");
      return false;
#endif
    }
    ok = http.begin(tls, url);
  } else {
    ok = http.begin(plain, url);
  }
  if (!ok) return false;
  http.setTimeout(10000);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("X-Firmware", FW_VERSION);
  return true;
}

// ── Protocol ─────────────────────────────────────────────────────────────────

static void queueAck(const String& sha, uint32_t rev, bool applied, const String& code, const String& msg) {
  pendingAck.due = true;
  pendingAck.sha = sha;
  pendingAck.rev = rev;
  pendingAck.applied = applied;
  pendingAck.code = code;
  pendingAck.msg = msg.substring(0, 200);
}

static bool sendAck() {
  JsonDocument doc;
  doc["v"] = 1;
  doc["sha"] = pendingAck.sha;
  doc["rev"] = pendingAck.rev;
  doc["st"] = pendingAck.applied ? "applied" : "failed";
  if (!pendingAck.applied) {
    doc["code"] = pendingAck.code;
    if (pendingAck.msg.length()) doc["msg"] = pendingAck.msg;
  }
  String body;
  serializeJson(doc, body);

  WiFiClientSecure tls;
  WiFiClient plain;
  HTTPClient http;
  if (!beginRequest(http, tls, plain, "/api/device/machines/config/ack")) return false;
  http.addHeader("Content-Type", "application/json");
  const int status = http.POST(body);
  http.end();
  if (status == 200) {
    pendingAck.due = false;
    Serial.printf("[cfg] reported %s\n", pendingAck.applied ? "applied" : pendingAck.code.c_str());
    return true;
  }
  Serial.printf("[cfg] report failed: HTTP %d, will retry\n", status);
  return false;
}

/** Handles one config the server sent. Returns false if the payload was unusable. */
static bool handleConfig(JsonDocument& doc) {
  const char* sha = doc["sha"] | "";
  const uint32_t rev = doc["rev"] | 0;
  const uint32_t poll = doc["poll"] | DEFAULT_POLL_S;
  pollSeconds = constrain(poll, MIN_POLL_S, MAX_POLL_S);
  if (!*sha) {
    Serial.println("[cfg] payload has no sha");
    return false;
  }

  String code, msg;
  ClawBoardSettings next;
  bool applied = false;
  if ((doc["v"] | 0) != 1) {
    code = "UNSUPPORTED_VERSION";
    msg = String("v=") + (int)(doc["v"] | 0);
  } else if (parseSettings(doc["settings"].as<JsonObjectConst>(), next, code, msg) &&
             applyToBoard(next, code, msg)) {
    applied = true;
    current = next;
    appliedSha = sha;
    appliedRev = rev;
    save();
  }
  Serial.printf("[cfg] rev %u (%s): %s %s\n", (unsigned)rev, sha, applied ? "applied" : code.c_str(), msg.c_str());
  // Remember it either way, so a rejected config isn't retried every poll.
  // A reboot starts from appliedSha again and gives it one more try.
  lastSeenSha = sha;
  queueAck(sha, rev, applied, code, msg);
  return true;
}

static bool pollOnce() {
  WiFiClientSecure tls;
  WiFiClient plain;
  HTTPClient http;
  if (!beginRequest(http, tls, plain, "/api/device/machines/config")) return false;
  if (lastSeenSha.length()) http.addHeader("If-None-Match", "\"" + lastSeenSha + "\"");

  const int status = http.GET();
  if (status == 304) {
    http.end();
    return true;
  }
  if (status != 200) {
    Serial.printf("[cfg] pull failed: HTTP %d%s\n", status, status == 401 ? " (token revoked or wrong)" : "");
    http.end();
    return false;
  }
  const String body = http.getString();
  http.end();

  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("[cfg] bad JSON: %s\n", err.c_str());
    return false;
  }
  return handleConfig(doc);
}

// ── Arduino ──────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n%s\n", FW_VERSION);
  boardSetup();

  // Run the last applied config straight away; the network may take a while.
  if (loadSaved()) {
    String code, msg;
    const bool ok = applyToBoard(current, code, msg);
    Serial.printf("[cfg] restored rev %u from flash: %s\n", (unsigned)appliedRev, ok ? "applied" : code.c_str());
  } else {
    defaultSettings(current);
    Serial.println("[cfg] nothing saved yet; waiting for the server");
  }
  lastSeenSha = appliedSha;
}

void loop() {
  if ((int32_t)(millis() - nextPollAt) < 0) {
    delay(50);
    return;
  }
  bool ok = ensureWifi() && pollOnce();
  if (ok && pendingAck.due) ok = sendAck();

  failures = ok ? 0 : (uint8_t)min(failures + 1, 6);
  const uint32_t wait = ok ? pollSeconds : min<uint32_t>(pollSeconds << failures, MAX_BACKOFF_S);
  nextPollAt = millis() + wait * 1000UL;
}
