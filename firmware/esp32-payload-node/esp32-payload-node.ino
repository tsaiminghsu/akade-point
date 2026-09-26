/*
 * ESP32 payload node — a MAVLink component on the vehicle's link.
 *
 * Wire its UART to a spare autopilot TELEM port (SERIALx_PROTOCOL = 2) or to
 * the Pi. It announces itself as component 25 (MAV_COMP_ID_USER1) of the
 * vehicle's system, so ArduPilot routes commands addressed to it, and:
 *
 *   - publishes sensor readings as NAMED_VALUE_FLOAT (2 Hz),
 *   - switches relay outputs on MAV_CMD_DO_SET_RELAY (181),
 *   - drives servo outputs on MAV_CMD_DO_SET_SERVO (183),
 *   - pulses a relay on MAV_CMD_USER_1 (31010): p1 = relay, p2 = ms (drop mechanism),
 *
 * answering every command with COMMAND_ACK. The ground station's Payload
 * panel shows the values and the relay buttons. Its HEARTBEAT uses
 * MAV_AUTOPILOT_INVALID so the companion never mistakes it for the vehicle.
 *
 * Board: "ESP32 Dev Module", esp32 core 2.x. Edit payload_config.h.
 */

#include <Arduino.h>

#include "payload_config.h"
#include "src/mavlink/akade_min/mavlink.h"

// ---- MAVLink numbers used here (the minimal dialect has no enums) ----------
static const uint8_t MAV_TYPE_ONBOARD_CONTROLLER = 18;
static const uint8_t MAV_AUTOPILOT_INVALID = 8;
static const uint8_t MAV_STATE_ACTIVE = 4;
static const uint16_t CMD_DO_SET_RELAY = 181;
static const uint16_t CMD_DO_SET_SERVO = 183;
static const uint16_t CMD_USER_1 = 31010;
static const uint8_t RESULT_ACCEPTED = 0;
static const uint8_t RESULT_DENIED = 2;
static const uint8_t RESULT_UNSUPPORTED = 3;

HardwareSerial& mavLink = Serial2;

static uint32_t lastHeartbeat = 0;
static uint32_t lastSensors = 0;
static uint32_t pulseUntil[RELAY_COUNT] = {0};

// ---- sending ----------------------------------------------------------------

static void sendMessage(const mavlink_message_t& msg) {
  uint8_t buf[MAVLINK_MAX_PACKET_LEN];
  const uint16_t len = mavlink_msg_to_send_buffer(buf, &msg);
  mavLink.write(buf, len);
}

static void sendHeartbeat() {
  mavlink_message_t msg;
  mavlink_msg_heartbeat_pack(SYSTEM_ID, COMPONENT_ID, &msg, MAV_TYPE_ONBOARD_CONTROLLER, MAV_AUTOPILOT_INVALID, 0, 0, MAV_STATE_ACTIVE);
  sendMessage(msg);
}

static void sendNamedFloat(const char* name, float value) {
  mavlink_message_t msg;
  char id[10] = {0};
  strncpy(id, name, sizeof(id));
  mavlink_msg_named_value_float_pack(SYSTEM_ID, COMPONENT_ID, &msg, millis(), id, value);
  sendMessage(msg);
}

static void sendAck(uint16_t command, uint8_t result, uint8_t toSys, uint8_t toComp) {
  mavlink_message_t msg;
  mavlink_msg_command_ack_pack(SYSTEM_ID, COMPONENT_ID, &msg, command, result, 0, 0, toSys, toComp);
  sendMessage(msg);
}

static void sendText(const char* text) {
  mavlink_message_t msg;
  char buf[50] = {0};
  strncpy(buf, text, sizeof(buf));
  mavlink_msg_statustext_pack(SYSTEM_ID, COMPONENT_ID, &msg, 6 /* INFO */, buf, 0, 0);
  sendMessage(msg);
}

// ---- outputs ------------------------------------------------------------------

static void setRelay(int index, bool on) {
  digitalWrite(RELAY_PINS[index], (on != RELAY_ACTIVE_LOW) ? HIGH : LOW);
}

static bool relayOn(int index) {
  return (digitalRead(RELAY_PINS[index]) == HIGH) != RELAY_ACTIVE_LOW;
}

// Servo PWM via LEDC: 50 Hz, 16-bit duty.
static void setServo(int index, float pwmUs) {
  const float us = constrain(pwmUs, 500.0f, 2500.0f);
  const uint32_t duty = (uint32_t)(us / 20000.0f * 65535.0f);
  ledcWrite(index, duty);
}

// ---- commands -----------------------------------------------------------------

static void handleCommand(const mavlink_message_t& msg) {
  mavlink_command_long_t cmd;
  mavlink_msg_command_long_decode(&msg, &cmd);
  // Only commands addressed to this component (ArduPilot forwards them here).
  if (cmd.target_system != SYSTEM_ID || cmd.target_component != COMPONENT_ID) return;

  uint8_t result = RESULT_UNSUPPORTED;
  if (cmd.command == CMD_DO_SET_RELAY) {
    const int i = (int)cmd.param1;
    if (i >= 0 && i < RELAY_COUNT) {
      setRelay(i, cmd.param2 >= 0.5f);
      pulseUntil[i] = 0;
      result = RESULT_ACCEPTED;
    } else {
      result = RESULT_DENIED;
    }
  } else if (cmd.command == CMD_DO_SET_SERVO) {
    const int i = (int)cmd.param1;
    if (i >= 0 && i < SERVO_COUNT && cmd.param2 >= 500 && cmd.param2 <= 2500) {
      setServo(i, cmd.param2);
      result = RESULT_ACCEPTED;
    } else {
      result = RESULT_DENIED;
    }
  } else if (cmd.command == CMD_USER_1) {
    // Pulse: relay p1 on for p2 ms (capped at 10 s), e.g. a drop release.
    const int i = (int)cmd.param1;
    const uint32_t ms = (uint32_t)constrain(cmd.param2, 50.0f, 10000.0f);
    if (i >= 0 && i < RELAY_COUNT) {
      setRelay(i, true);
      pulseUntil[i] = millis() + ms;
      sendText("payload pulse");
      result = RESULT_ACCEPTED;
    } else {
      result = RESULT_DENIED;
    }
  }
  sendAck(cmd.command, result, msg.sysid, msg.compid);
}

static void readLink() {
  static mavlink_message_t msg;
  static mavlink_status_t status;
  while (mavLink.available() > 0) {
    const uint8_t c = mavLink.read();
    if (mavlink_parse_char(MAVLINK_COMM_0, c, &msg, &status)) {
      if (msg.msgid == MAVLINK_MSG_ID_COMMAND_LONG) handleCommand(msg);
    }
  }
}

// ---- sensors ------------------------------------------------------------------

static void publishSensors() {
  for (int i = 0; i < ANALOG_COUNT; ++i) {
    const float volts = analogReadMilliVolts(ANALOG_PINS[i]) / 1000.0f * ANALOG_SCALE[i];
    sendNamedFloat(ANALOG_NAMES[i], volts);
  }
  for (int i = 0; i < RELAY_COUNT; ++i) {
    char name[10];
    snprintf(name, sizeof(name), "RELAY%d", i);
    sendNamedFloat(name, relayOn(i) ? 1.0f : 0.0f);
  }
}

// ---- Arduino --------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  mavLink.begin(LINK_BAUD, SERIAL_8N1, LINK_RX_PIN, LINK_TX_PIN);
  for (int i = 0; i < RELAY_COUNT; ++i) {
    pinMode(RELAY_PINS[i], OUTPUT);
    setRelay(i, false);
  }
  for (int i = 0; i < SERVO_COUNT; ++i) {
    ledcSetup(i, 50, 16);
    ledcAttachPin(SERVO_PINS[i], i);
    setServo(i, 1500);
  }
  analogReadResolution(12);
  Serial.println("payload node ready");
}

void loop() {
  const uint32_t now = millis();
  readLink();
  for (int i = 0; i < RELAY_COUNT; ++i) {
    if (pulseUntil[i] != 0 && (int32_t)(now - pulseUntil[i]) >= 0) {
      setRelay(i, false);
      pulseUntil[i] = 0;
    }
  }
  if (now - lastHeartbeat >= 1000) {
    lastHeartbeat = now;
    sendHeartbeat();
  }
  if (now - lastSensors >= 500) {
    lastSensors = now;
    publishSensors();
  }
}
