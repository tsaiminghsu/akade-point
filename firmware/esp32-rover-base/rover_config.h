#pragma once
// ESP32 rover base configuration: pins and chassis. WiFi credentials live in
// secrets.h (copy secrets.example.h; it is gitignored).

// The ground relay: a companion instance listening with
// mavlink_url = "udpin:0.0.0.0:14560".
static const char* const GROUND_HOST = "192.168.1.20";
static const uint16_t GROUND_PORT = 14560;
static const uint16_t LOCAL_PORT = 14561;

// MAVLink identity; must differ from any other vehicle on the same companion.
static const uint8_t SYSTEM_ID = 2;
static const uint8_t COMPONENT_ID = 1;

// Motor driver: PWM + direction per side.
static const int LEFT_PWM_PIN = 25;
static const int LEFT_DIR_PIN = 26;
static const int RIGHT_PWM_PIN = 27;
static const int RIGHT_DIR_PIN = 14;
static const bool LEFT_REVERSED = false;
static const bool RIGHT_REVERSED = true;

// Chassis: full-throttle speed (m/s) and track width (m) for skid-steer mixing.
static const float MAX_SPEED_MS = 1.5f;
static const float TRACK_WIDTH_M = 0.30f;
static const float MAX_YAW_RATE = 2.0f;  // rad/s

// Battery: ADC pin through a divider; BATTERY_SCALE multiplies the pin voltage.
static const int BATTERY_PIN = 34;
static const float BATTERY_SCALE = 11.0f;

// Safety timers.
static const uint32_t DEADMAN_MS = 500;
static const uint32_t LINK_LOSS_MS = 2000;
