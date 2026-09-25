#pragma once
// Where settings leave the ESP32 for the machine. Pick one integration below,
// or replace board.cpp with your own. A stock 飛絡力 board is set from its
// joystick menu and has no data port, so a real install needs a main board
// or controller that accepts parameters (see docs/claw-machine-esp32.md).
//
//   BOARD_LOG_ONLY  print the settings over USB serial and report success.
//                   For bench testing the delivery without a machine.
//   BOARD_UART      send them to a controller over a serial line:
//                     ESP32 -> "SET <key> <value>\n" x 24, then "COMMIT\n"
//                     controller -> "OK\n" or "ERR <CODE>\n" within 2 s

#define BOARD_LOG_ONLY
// #define BOARD_UART

#define BOARD_UART_RX 16
#define BOARD_UART_TX 17
#define BOARD_UART_BAUD 115200
#define BOARD_UART_TIMEOUT_MS 2000

#include "claw_settings.h"

void boardSetup();

/**
 * Hand the settings to the machine. On failure return false with an
 * upper-case `code` ([A-Z0-9_], at most 32 chars) and an optional `msg`; both
 * are reported to the Control Center and shown on the machine's event log.
 */
bool applyToBoard(const ClawBoardSettings& s, String& code, String& msg);
