#pragma once
// Payload node configuration. Edit for your wiring.

// MAVLink identity: the vehicle's system id (SYSID_THISMAV, usually 1) and
// component 25 (MAV_COMP_ID_USER1).
static const uint8_t SYSTEM_ID = 1;
static const uint8_t COMPONENT_ID = 25;

// UART to the autopilot TELEM port (or the Pi). Match SERIALx_BAUD.
static const uint32_t LINK_BAUD = 115200;
static const int LINK_RX_PIN = 16;
static const int LINK_TX_PIN = 17;

// Relay / MOSFET outputs, index 0..RELAY_COUNT-1 as seen from the ground station.
static const int RELAY_COUNT = 4;
static const int RELAY_PINS[RELAY_COUNT] = {25, 26, 27, 14};
// Most relay boards switch on a LOW input.
static const bool RELAY_ACTIVE_LOW = true;

// Servo outputs (50 Hz PWM), index 0..SERVO_COUNT-1.
static const int SERVO_COUNT = 2;
static const int SERVO_PINS[SERVO_COUNT] = {32, 33};

// Analog inputs published as NAMED_VALUE_FLOAT (names up to 10 characters).
// ANALOG_SCALE multiplies the pin voltage, e.g. a 1:11 divider reads 11.0.
static const int ANALOG_COUNT = 2;
static const int ANALOG_PINS[ANALOG_COUNT] = {34, 35};
static const char* const ANALOG_NAMES[ANALOG_COUNT] = {"PAY_VBAT", "PAY_SENS1"};
static const float ANALOG_SCALE[ANALOG_COUNT] = {11.0f, 1.0f};
