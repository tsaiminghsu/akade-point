/** @file
 *  @brief MAVLink comm protocol generated from akade_min.xml
 *  @see http://mavlink.org
 */
#pragma once
#ifndef MAVLINK_AKADE_MIN_H
#define MAVLINK_AKADE_MIN_H

#ifndef MAVLINK_H
    #error Wrong include order: MAVLINK_AKADE_MIN.H MUST NOT BE DIRECTLY USED. Include mavlink.h from the same directory instead or set ALL AND EVERY defines from MAVLINK.H manually accordingly, including the #define MAVLINK_H call.
#endif

#define MAVLINK_AKADE_MIN_XML_HASH -8776836115664613820

#ifdef __cplusplus
extern "C" {
#endif

// MESSAGE LENGTHS AND CRCS

#ifndef MAVLINK_MESSAGE_LENGTHS
#define MAVLINK_MESSAGE_LENGTHS {}
#endif

#ifndef MAVLINK_MESSAGE_CRCS
#define MAVLINK_MESSAGE_CRCS {{0, 50, 9, 9, 0, 0, 0}, {1, 124, 31, 43, 0, 0, 0}, {11, 89, 6, 6, 1, 4, 0}, {24, 24, 30, 52, 0, 0, 0}, {30, 39, 28, 28, 0, 0, 0}, {33, 104, 28, 28, 0, 0, 0}, {74, 20, 20, 20, 0, 0, 0}, {76, 152, 33, 33, 3, 30, 31}, {77, 143, 3, 10, 3, 8, 9}, {84, 143, 53, 53, 3, 50, 51}, {251, 170, 18, 18, 0, 0, 0}, {253, 83, 51, 54, 0, 0, 0}}
#endif

#include "../protocol.h"

#define MAVLINK_ENABLED_AKADE_MIN

// ENUM DEFINITIONS



// MAVLINK VERSION

#ifndef MAVLINK_VERSION
#define MAVLINK_VERSION 3
#endif

#if (MAVLINK_VERSION == 0)
#undef MAVLINK_VERSION
#define MAVLINK_VERSION 3
#endif

// MESSAGE DEFINITIONS
#include "./mavlink_msg_heartbeat.h"
#include "./mavlink_msg_sys_status.h"
#include "./mavlink_msg_set_mode.h"
#include "./mavlink_msg_gps_raw_int.h"
#include "./mavlink_msg_attitude.h"
#include "./mavlink_msg_global_position_int.h"
#include "./mavlink_msg_vfr_hud.h"
#include "./mavlink_msg_command_long.h"
#include "./mavlink_msg_command_ack.h"
#include "./mavlink_msg_set_position_target_local_ned.h"
#include "./mavlink_msg_named_value_float.h"
#include "./mavlink_msg_statustext.h"

// base include



#if MAVLINK_AKADE_MIN_XML_HASH == MAVLINK_PRIMARY_XML_HASH
# define MAVLINK_MESSAGE_INFO {MAVLINK_MESSAGE_INFO_HEARTBEAT, MAVLINK_MESSAGE_INFO_SYS_STATUS, MAVLINK_MESSAGE_INFO_SET_MODE, MAVLINK_MESSAGE_INFO_GPS_RAW_INT, MAVLINK_MESSAGE_INFO_ATTITUDE, MAVLINK_MESSAGE_INFO_GLOBAL_POSITION_INT, MAVLINK_MESSAGE_INFO_VFR_HUD, MAVLINK_MESSAGE_INFO_COMMAND_LONG, MAVLINK_MESSAGE_INFO_COMMAND_ACK, MAVLINK_MESSAGE_INFO_SET_POSITION_TARGET_LOCAL_NED, MAVLINK_MESSAGE_INFO_NAMED_VALUE_FLOAT, MAVLINK_MESSAGE_INFO_STATUSTEXT}
# define MAVLINK_MESSAGE_NAMES {{ "ATTITUDE", 30 }, { "COMMAND_ACK", 77 }, { "COMMAND_LONG", 76 }, { "GLOBAL_POSITION_INT", 33 }, { "GPS_RAW_INT", 24 }, { "HEARTBEAT", 0 }, { "NAMED_VALUE_FLOAT", 251 }, { "SET_MODE", 11 }, { "SET_POSITION_TARGET_LOCAL_NED", 84 }, { "STATUSTEXT", 253 }, { "SYS_STATUS", 1 }, { "VFR_HUD", 74 }}
# if MAVLINK_COMMAND_24BIT
#  include "../mavlink_get_info.h"
# endif
#endif

#ifdef __cplusplus
}
#endif // __cplusplus
#endif // MAVLINK_AKADE_MIN_H
