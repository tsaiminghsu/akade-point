/*
 * ESP32 rover base — a small MAVLink ground vehicle for a rover without an
 * autopilot (the ESP32 drives the motors itself).
 *
 * It speaks enough MAVLink for the web ground station, through a companion
 * instance acting as its ground relay (vehicle-companion@<name> on a Pi or
 * laptop, mavlink_url = "udpin:0.0.0.0:14560"):
 *
 *   - HEARTBEAT as MAV_TYPE_GROUND_ROVER / MAV_AUTOPILOT_GENERIC, using
 *     ArduPilot Rover's mode numbers (MANUAL 0, HOLD 4, GUIDED 15) so the
 *     ground station names them correctly,
 *   - arm/disarm (MAV_CMD_COMPONENT_ARM_DISARM) and mode changes
 *     (MAV_CMD_DO_SET_MODE or SET_MODE),
 *   - driving from SET_POSITION_TARGET_LOCAL_NED in the body frame (forward
 *     speed + yaw rate — exactly what the ground station's joystick sends),
 *     mixed to differential (skid-steer) motor outputs,
 *   - SYS_STATUS with battery voltage, optional GPS as GPS_RAW_INT /
 *     GLOBAL_POSITION_INT / VFR_HUD.
 *
 * Safety: motors stop 500 ms after the last drive command (deadman), and the
 * rover drops to HOLD when it hears nothing from the ground for 2 s. It does
 * not fly missions — use ArduPilot Rover on a real autopilot for waypoints.
 *
 * Board: "ESP32 Dev Module", esp32 core 2.x. Edit rover_config.h and copy
 * secrets.example.h to secrets.h.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>

#include "rover_config.h"
#include "secrets.h"
#include "src/mavlink/akade_min/mavlink.h"

static const uint8_t MAV_TYPE_GROUND_ROVER = 10;
static const uint8_t MAV_AUTOPILOT_GENERIC = 0;
static const uint8_t MODE_FLAG_CUSTOM = 1;
static const uint8_t MODE_FLAG_ARMED = 128;
static const uint8_t STATE_STANDBY = 3;
static const uint8_t STATE_ACTIVE = 4;
static const uint16_t CMD_ARM_DISARM = 400;
static const uint16_t CMD_DO_SET_MODE = 176;
static const uint8_t RESULT_ACCEPTED = 0;
static const uint8_t RESULT_DENIED = 2;
static const uint8_t RESULT_UNSUPPORTED = 3;
static const uint8_t RESULT_FAILED = 4;
static const uint8_t FRAME_BODY_NED = 8;
static const uint32_t SENSOR_BATTERY = 33554432;  // MAV_SYS_STATUS_SENSOR_BATTERY

enum Mode : uint32_t { MODE_MANUAL = 0, MODE_HOLD = 4, MODE_GUIDED = 15 };

WiFiUDP udp;
IPAddress groundIp;

static bool armed = false;
static uint32_t mode = MODE_HOLD;
static float targetSpeed = 0;     // m/s, + forward
static float targetYawRate = 0;   // rad/s, + clockwise (NED)
static uint32_t lastDriveMs = 0;
static uint32_t lastGroundMs = 0;
static uint32_t lastHeartbeat = 0;
static uint32_t lastStatus = 0;

// ---- transport ----------------------------------------------------------------

static void sendMessage(const mavlink_message_t& msg) {
  uint8_t buf[MAVLINK_MAX_PACKET_LEN];
  const uint16_t len = mavlink_msg_to_send_buffer(buf, &msg);
  udp.beginPacket(groundIp, GROUND_PORT);
  udp.write(buf, len);
  udp.endPacket();
}

static void sendText(uint8_t severity, const char* text) {
  mavlink_message_t msg;
  char buf[50] = {0};
  strncpy(buf, text, sizeof(buf));
  mavlink_msg_statustext_pack(SYSTEM_ID, COMPONENT_ID, &msg, severity, buf, 0, 0);
  sendMessage(msg);
}

static void sendAck(uint16_t command, uint8_t result, uint8_t toSys, uint8_t toComp) {
  mavlink_message_t msg;
  mavlink_msg_command_ack_pack(SYSTEM_ID, COMPONENT_ID, &msg, command, result, 0, 0, toSys, toComp);
  sendMessage(msg);
}

// ---- motors -------------------------------------------------------------------

// One side: PWM magnitude on LEDC channel, direction on a GPIO (e.g. a
// BTS7960 or TB6612-style driver). -1..1.
static void driveSide(int channel, int dirPin, float cmd) {
  cmd = constrain(cmd, -1.0f, 1.0f);
  digitalWrite(dirPin, cmd >= 0 ? HIGH : LOW);
  ledcWrite(channel, (uint32_t)(fabsf(cmd) * 1023.0f));
}

static void stopMotors() {
  driveSide(0, LEFT_DIR_PIN, 0);
  driveSide(1, RIGHT_DIR_PIN, 0);
}

// Skid steer: forward speed plus/minus a turn term from the yaw rate.
static void applyDrive(float speed, float yawRate) {
  const float fwd = speed / MAX_SPEED_MS;
  const float turn = yawRate * TRACK_WIDTH_M / 2.0f / MAX_SPEED_MS;
  float left = fwd + turn;
  float right = fwd - turn;
  const float peak = max(fabsf(left), fabsf(right));
  if (peak > 1.0f) {
    left /= peak;
    right /= peak;
  }
  driveSide(0, LEFT_DIR_PIN, LEFT_REVERSED ? -left : left);
  driveSide(1, RIGHT_DIR_PIN, RIGHT_REVERSED ? -right : right);
}

static void setMode(uint32_t m) {
  if (m == mode) return;
  mode = m;
  targetSpeed = targetYawRate = 0;
  stopMotors();
  sendText(6, m == MODE_GUIDED ? "Mode GUIDED" : m == MODE_MANUAL ? "Mode MANUAL" : "Mode HOLD");
}

// ---- incoming -----------------------------------------------------------------

static bool forMe(uint8_t sys, uint8_t comp) {
  return (sys == 0 || sys == SYSTEM_ID) && (comp == 0 || comp == COMPONENT_ID);
}

static void handleCommandLong(const mavlink_message_t& msg) {
  mavlink_command_long_t c;
  mavlink_msg_command_long_decode(&msg, &c);
  if (!forMe(c.target_system, c.target_component)) return;
  uint8_t result = RESULT_UNSUPPORTED;
  if (c.command == CMD_ARM_DISARM) {
    if (c.param1 >= 0.5f) {
      armed = true;
      sendText(6, "Arming motors");
      result = RESULT_ACCEPTED;
    } else {
      armed = false;
      stopMotors();
      sendText(6, "Disarming motors");
      result = RESULT_ACCEPTED;
    }
  } else if (c.command == CMD_DO_SET_MODE) {
    const uint32_t m = (uint32_t)c.param2;
    if (m == MODE_MANUAL || m == MODE_HOLD || m == MODE_GUIDED) {
      setMode(m);
      result = RESULT_ACCEPTED;
    } else {
      result = RESULT_FAILED;
    }
  }
  sendAck(c.command, result, msg.sysid, msg.compid);
}

static void handleSetMode(const mavlink_message_t& msg) {
  mavlink_set_mode_t s;
  mavlink_msg_set_mode_decode(&msg, &s);
  if (s.target_system != SYSTEM_ID) return;
  const bool ok = s.custom_mode == MODE_MANUAL || s.custom_mode == MODE_HOLD || s.custom_mode == MODE_GUIDED;
  if (ok) setMode(s.custom_mode);
  sendAck(MAVLINK_MSG_ID_SET_MODE, ok ? RESULT_ACCEPTED : RESULT_FAILED, msg.sysid, msg.compid);
}

static void handleTarget(const mavlink_message_t& msg) {
  mavlink_set_position_target_local_ned_t t;
  mavlink_msg_set_position_target_local_ned_decode(&msg, &t);
  if (!forMe(t.target_system, t.target_component)) return;
  if (t.coordinate_frame != FRAME_BODY_NED || mode != MODE_GUIDED || !armed) return;
  targetSpeed = constrain(t.vx, -MAX_SPEED_MS, MAX_SPEED_MS);
  targetYawRate = constrain(t.yaw_rate, -MAX_YAW_RATE, MAX_YAW_RATE);
  lastDriveMs = millis();
}

static void readLink() {
  static mavlink_message_t msg;
  static mavlink_status_t status;
  int size;
  uint8_t buf[512];
  while ((size = udp.parsePacket()) > 0) {
    const int n = udp.read(buf, sizeof(buf));
    lastGroundMs = millis();
    for (int i = 0; i < n; ++i) {
      if (!mavlink_parse_char(MAVLINK_COMM_0, buf[i], &msg, &status)) continue;
      switch (msg.msgid) {
        case MAVLINK_MSG_ID_COMMAND_LONG:
          handleCommandLong(msg);
          break;
        case MAVLINK_MSG_ID_SET_MODE:
          handleSetMode(msg);
          break;
        case MAVLINK_MSG_ID_SET_POSITION_TARGET_LOCAL_NED:
          handleTarget(msg);
          break;
        default:
          break;
      }
    }
  }
}

// ---- telemetry ----------------------------------------------------------------

static float batteryVolts() {
  return analogReadMilliVolts(BATTERY_PIN) / 1000.0f * BATTERY_SCALE;
}

static void sendHeartbeat() {
  mavlink_message_t msg;
  const uint8_t base = MODE_FLAG_CUSTOM | (armed ? MODE_FLAG_ARMED : 0);
  mavlink_msg_heartbeat_pack(SYSTEM_ID, COMPONENT_ID, &msg, MAV_TYPE_GROUND_ROVER, MAV_AUTOPILOT_GENERIC, base, mode,
                             armed ? STATE_ACTIVE : STATE_STANDBY);
  sendMessage(msg);
}

static void sendStatus() {
  mavlink_message_t msg;
  const uint16_t mv = (uint16_t)(batteryVolts() * 1000.0f);
  mavlink_msg_sys_status_pack(SYSTEM_ID, COMPONENT_ID, &msg, SENSOR_BATTERY, SENSOR_BATTERY, SENSOR_BATTERY, 0, mv, -1, -1, 0, 0,
                              0, 0, 0, 0, 0, 0, 0);
  sendMessage(msg);
  // Commanded speed as groundspeed until a GPS provides the real one.
  mavlink_msg_vfr_hud_pack(SYSTEM_ID, COMPONENT_ID, &msg, 0, fabsf(targetSpeed), 0, (int16_t)(fabsf(targetSpeed) / MAX_SPEED_MS * 100), 0, 0);
  sendMessage(msg);
}

// ---- Arduino --------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  pinMode(LEFT_DIR_PIN, OUTPUT);
  pinMode(RIGHT_DIR_PIN, OUTPUT);
  ledcSetup(0, 20000, 10);
  ledcSetup(1, 20000, 10);
  ledcAttachPin(LEFT_PWM_PIN, 0);
  ledcAttachPin(RIGHT_PWM_PIN, 1);
  stopMotors();
  analogReadResolution(12);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // power saving adds 100+ ms of latency
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(200);
  groundIp.fromString(GROUND_HOST);
  udp.begin(LOCAL_PORT);
  Serial.printf("rover base %s -> %s:%u\n", WiFi.localIP().toString().c_str(), GROUND_HOST, GROUND_PORT);
}

void loop() {
  const uint32_t now = millis();
  readLink();

  // Link loss: nothing from the ground for 2 s -> HOLD (and motors stop).
  if (mode != MODE_HOLD && lastGroundMs != 0 && now - lastGroundMs > LINK_LOSS_MS) {
    setMode(MODE_HOLD);
    sendText(2, "Link lost: HOLD");
  }
  // Deadman: no fresh drive command -> stop.
  const bool fresh = now - lastDriveMs < DEADMAN_MS;
  if (armed && mode == MODE_GUIDED && fresh) applyDrive(targetSpeed, targetYawRate);
  else stopMotors();

  if (now - lastHeartbeat >= 1000) {
    lastHeartbeat = now;
    sendHeartbeat();
  }
  if (now - lastStatus >= 500) {
    lastStatus = now;
    sendStatus();
  }
  delay(2);
}
