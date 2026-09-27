// Claw machine config puller for ESP32 (Arduino core 2.x, ArduinoJson 7).
//
// Every `poll` seconds (the server says how many) it asks the Control Center
// for this machine's board settings, with If-None-Match set to the last
// config it processed, so an unchanged config costs a 304 and no parsing.
// A new config is checked, handed to the machine (board.cpp), saved to flash
// and reported back as applied or failed. On boot the last applied config is
// re-applied from flash, so the machine keeps its settings with no network.
//
// With MQTT_URI set it also subscribes to claw/<MACHINE_ID>/config. A notice
// there means "a config was saved": the board pulls at once, and while the
// subscription is up it only polls every `pollMqtt` seconds as a safety net.
// The notice carries no settings; HTTPS stays the only way they arrive.
//
// Setup: copy secrets.example.h to secrets.h and fill it in; pick the board
// integration in board.h. Protocol: docs/claw-machine-esp32.md.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <atomic>
#include <esp_idf_version.h>
#include <time.h>

#include "secrets.h"
#include "claw_settings.h"
#include "board.h"

// esp-mqtt ships with the esp32 core. Its config struct was reshaped in
// ESP-IDF 5 (Arduino core 3.x); this sketch uses the IDF 4.4 form (core 2.x).
#if ESP_IDF_VERSION_MAJOR < 5
#include "mqtt_client.h"
#define CLAW_MQTT 1
#else
#warning "MQTT notices need esp32 Arduino core 2.x; building without them (the board polls)."
#define CLAW_MQTT 0
#endif

#ifndef MQTT_ROOT_CA
#define MQTT_ROOT_CA ROOT_CA
#endif

#define FW_VERSION "claw-esp32/1.1.0"

static const uint32_t DEFAULT_POLL_S = 30;
static const uint32_t DEFAULT_POLL_MQTT_S = 300;
static const uint32_t MIN_POLL_S = 10;
static const uint32_t MAX_POLL_S = 3600;
/** Longest wait between attempts while the server is unreachable. */
static const uint32_t MAX_BACKOFF_S = 600;
/** Notices closer together than this share one pull. */
static const uint32_t MIN_NOTICE_GAP_MS = 2000;
static const char* NVS_NAMESPACE = "clawcfg";

static Preferences prefs;
static ClawBoardSettings current;
static String appliedSha;      // saved in flash with the values
static uint32_t appliedRev = 0;
/** Sent as If-None-Match: the last config processed, applied or rejected. */
static String lastSeenSha;
static uint32_t pollSeconds = DEFAULT_POLL_S;
static uint32_t pollMqttSeconds = DEFAULT_POLL_MQTT_S;
static uint32_t nextPollAt = 0;
static uint32_t lastPullAt = 0;
static uint8_t failures = 0;

// Set from the MQTT task, read by loop().
static std::atomic<bool> mqttUp{false};
static std::atomic<bool> noticePending{false};

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

static bool mqttWanted() { return CLAW_MQTT && strlen(MQTT_URI) > 0; }

static bool mqttIsTls() { return strncmp(MQTT_URI, "mqtts://", 8) == 0; }

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
  if (isHttps() || (mqttWanted() && mqttIsTls())) syncClock();
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
  // Tells the server this board hears notices, so the setup page can say so.
  if (mqttUp) http.addHeader("X-Notify", "mqtt");
  return true;
}

// ── MQTT notices ─────────────────────────────────────────────────────────────

#if CLAW_MQTT
static esp_mqtt_client_handle_t mqttClient = nullptr;
static char mqttTopic[96];

// Runs in the esp-mqtt task: only flip flags here; loop() does the work.
static void onMqttEvent(void*, esp_event_base_t, int32_t eventId, void* eventData) {
  auto event = static_cast<esp_mqtt_event_handle_t>(eventData);
  switch ((esp_mqtt_event_id_t)eventId) {
    case MQTT_EVENT_CONNECTED:
      esp_mqtt_client_subscribe(event->client, mqttTopic, 1);
      mqttUp = true;
      // Anything saved while we were away: check now.
      noticePending = true;
      break;
    case MQTT_EVENT_DISCONNECTED:
      mqttUp = false;
      break;
    case MQTT_EVENT_DATA:
      // Any message on our topic means "pull now". If it's about a config we
      // already have, the pull's If-None-Match makes it a cheap 304.
      noticePending = true;
      break;
    default:
      break;
  }
}

/** Starts the MQTT client once Wi-Fi is up; esp-mqtt reconnects by itself after that. */
static void startMqtt() {
  if (mqttClient || !mqttWanted()) return;
  static bool refused = false;  // say why only once
  if (refused) return;
  if (strlen(MACHINE_ID) == 0) {
    Serial.println("[mqtt] MQTT_URI is set but MACHINE_ID is empty; notices off");
    refused = true;
    return;
  }
  if (mqttIsTls() && strstr(MQTT_ROOT_CA, "BEGIN CERTIFICATE") == nullptr) {
    Serial.println("[mqtt] mqtts:// needs ROOT_CA (or MQTT_ROOT_CA) in secrets.h; notices off");
    refused = true;
    return;
  }
  snprintf(mqttTopic, sizeof(mqttTopic), "claw/%s/config", MACHINE_ID);

  esp_mqtt_client_config_t cfg = {};
  cfg.uri = MQTT_URI;
  cfg.client_id = MACHINE_ID;  // AWS IoT: must equal the Thing name
  cfg.keepalive = 60;
  if (mqttIsTls()) {
    cfg.cert_pem = MQTT_ROOT_CA;
    // AWS IoT authenticates the board by its certificate.
    if (strstr(DEVICE_CERT, "BEGIN") && strstr(DEVICE_KEY, "BEGIN")) {
      cfg.client_cert_pem = DEVICE_CERT;
      cfg.client_key_pem = DEVICE_KEY;
    }
  }
  mqttClient = esp_mqtt_client_init(&cfg);
  if (!mqttClient) {
    Serial.println("[mqtt] client init failed; notices off");
    refused = true;
    return;
  }
  esp_mqtt_client_register_event(mqttClient, (esp_mqtt_event_id_t)ESP_EVENT_ANY_ID, onMqttEvent, nullptr);
  esp_mqtt_client_start(mqttClient);
  Serial.printf("[mqtt] connecting to %s as %s\n", MQTT_URI, MACHINE_ID);
}
#else
static void startMqtt() {}
#endif

/** Logs subscription changes (the MQTT task itself stays quiet). */
static void reportMqtt() {
  static bool reported = false;
  const bool up = mqttUp;
  if (up == reported) return;
  reported = up;
  Serial.printf("[mqtt] %s\n", up ? "subscribed; polling slowly" : "disconnected; polling normally");
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
  const uint32_t pollMqtt = doc["pollMqtt"] | DEFAULT_POLL_MQTT_S;
  pollSeconds = constrain(poll, MIN_POLL_S, MAX_POLL_S);
  pollMqttSeconds = constrain(pollMqtt, MIN_POLL_S, MAX_POLL_S);
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
  reportMqtt();
  // Lost the subscription: don't sit out a wait that assumed notices.
  const uint32_t normalWaitMs = pollSeconds * 1000UL;
  if (!mqttUp && (int32_t)(nextPollAt - millis()) > (int32_t)normalWaitMs) nextPollAt = millis() + normalWaitMs;
  const bool due = (int32_t)(millis() - nextPollAt) >= 0;
  const bool rung = noticePending && millis() - lastPullAt >= MIN_NOTICE_GAP_MS;
  if (!due && !rung) {
    delay(50);
    return;
  }
  noticePending = false;
  if (rung && !due) Serial.println("[mqtt] notice: pulling now");

  bool ok = ensureWifi();
  if (ok) startMqtt();
  ok = ok && pollOnce();
  lastPullAt = millis();
  if (ok && pendingAck.due) ok = sendAck();

  // A board that hears notices only needs a slow safety poll.
  const uint32_t every = mqttUp ? pollMqttSeconds : pollSeconds;
  failures = ok ? 0 : (uint8_t)min(failures + 1, 6);
  const uint32_t wait = ok ? every : min<uint32_t>(pollSeconds << failures, MAX_BACKOFF_S);
  nextPollAt = millis() + wait * 1000UL;
}
