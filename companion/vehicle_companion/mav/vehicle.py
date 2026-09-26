"""What kind of thing is on the other end of a heartbeat: vehicle class,
autopilot family, mode names and numbers, firmware string, capabilities."""

from __future__ import annotations

from .proto import mavlink, mavutil

# Heartbeat types that are components, never the vehicle we fly.
NON_VEHICLE_TYPES = frozenset(
    {
        mavlink.MAV_TYPE_GCS,
        mavlink.MAV_TYPE_ONBOARD_CONTROLLER,
        mavlink.MAV_TYPE_GIMBAL,
        mavlink.MAV_TYPE_ADSB,
        mavlink.MAV_TYPE_CAMERA,
        mavlink.MAV_TYPE_CHARGING_STATION,
        mavlink.MAV_TYPE_FLARM,
        mavlink.MAV_TYPE_SERVO,
        mavlink.MAV_TYPE_ODID,
        mavlink.MAV_TYPE_BATTERY,
        mavlink.MAV_TYPE_PARACHUTE,
        mavlink.MAV_TYPE_LOG,
        mavlink.MAV_TYPE_OSD,
        mavlink.MAV_TYPE_IMU,
        mavlink.MAV_TYPE_GPS,
        mavlink.MAV_TYPE_WINCH,
        mavlink.MAV_TYPE_ANTENNA_TRACKER,
    }
)

COPTER_TYPES = frozenset(
    {
        mavlink.MAV_TYPE_QUADROTOR,
        mavlink.MAV_TYPE_COAXIAL,
        mavlink.MAV_TYPE_HELICOPTER,
        mavlink.MAV_TYPE_HEXAROTOR,
        mavlink.MAV_TYPE_OCTOROTOR,
        mavlink.MAV_TYPE_TRICOPTER,
        mavlink.MAV_TYPE_DODECAROTOR,
        mavlink.MAV_TYPE_DECAROTOR,
        mavlink.MAV_TYPE_GENERIC_MULTIROTOR,
    }
)
ROVER_TYPES = frozenset({mavlink.MAV_TYPE_GROUND_ROVER, mavlink.MAV_TYPE_SURFACE_BOAT})
PLANE_TYPES = frozenset(
    {
        mavlink.MAV_TYPE_FIXED_WING,
        mavlink.MAV_TYPE_VTOL_DUOROTOR,
        mavlink.MAV_TYPE_VTOL_QUADROTOR,
        mavlink.MAV_TYPE_VTOL_TILTROTOR,
    }
)

MAV_STATE_NAMES = {
    0: "UNINIT",
    1: "BOOT",
    2: "CALIBRATING",
    3: "STANDBY",
    4: "ACTIVE",
    5: "CRITICAL",
    6: "EMERGENCY",
    7: "POWEROFF",
    8: "FLIGHT_TERMINATION",
}


def is_vehicle(hb) -> bool:
    """A heartbeat from something we could fly: has an autopilot and is not a
    peripheral. ESP32 payload nodes send MAV_AUTOPILOT_INVALID and are skipped;
    the ESP32 rover base sends GENERIC + GROUND_ROVER and counts."""
    return hb.autopilot != mavlink.MAV_AUTOPILOT_INVALID and hb.type not in NON_VEHICLE_TYPES


def vehicle_class(mav_type: int) -> str:
    if mav_type in COPTER_TYPES:
        return "copter"
    if mav_type in ROVER_TYPES:
        return "rover"
    if mav_type in PLANE_TYPES:
        return "plane"
    return "other"


def autopilot_family(autopilot: int) -> str:
    if autopilot == mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA:
        return "ardupilot"
    if autopilot == mavlink.MAV_AUTOPILOT_PX4:
        return "px4"
    if autopilot == mavlink.MAV_AUTOPILOT_GENERIC:
        return "generic"
    return "other"


def is_armed(hb) -> bool:
    return bool(hb.base_mode & mavlink.MAV_MODE_FLAG_SAFETY_ARMED)


def mode_name(hb) -> str:
    """Flight-mode name from a heartbeat. ArduPilot maps by vehicle type; the
    ESP32 rover base reuses ArduPilot Rover's numbers so it decodes the same."""
    return mavutil.mode_string_v10(hb)


def ardupilot_modes(mav_type: int) -> dict[str, int]:
    return dict(mavutil.mode_mapping_byname(mav_type) or {})


def px4_mode(name: str) -> tuple[int, int, int] | None:
    """(base_mode, main_mode, sub_mode) for a PX4 mode name."""
    return mavutil.px4_map.get(name)


def firmware_string(version_msg, hb) -> str | None:
    if version_msg is None:
        return None
    v = getattr(version_msg, "flight_sw_version", 0)
    if not v:
        return None
    major, minor, patch = (v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF
    prefix = ""
    if hb is not None and hb.autopilot == mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA:
        prefix = {"copter": "ArduCopter ", "rover": "ArduRover ", "plane": "ArduPlane "}.get(vehicle_class(hb.type), "ArduPilot ")
    elif hb is not None and hb.autopilot == mavlink.MAV_AUTOPILOT_PX4:
        prefix = "PX4 "
    return f"{prefix}V{major}.{minor}.{patch}"


def capabilities(version_msg, hb) -> list[str]:
    """Feature flags the UI uses to show or hide tabs. Fence/rally come from the
    AUTOPILOT_VERSION capability bits; before that arrives we only claim what
    every mission-capable autopilot supports."""
    if hb is None:
        return []
    family = autopilot_family(hb.autopilot)
    caps: list[str] = []
    if family in ("ardupilot", "px4"):
        caps += ["mission", "params"]
    if version_msg is not None:
        bits = getattr(version_msg, "capabilities", 0)
        if bits & mavlink.MAV_PROTOCOL_CAPABILITY_MISSION_FENCE:
            caps.append("fence")
        if bits & mavlink.MAV_PROTOCOL_CAPABILITY_MISSION_RALLY:
            caps.append("rally")
        if bits & mavlink.MAV_PROTOCOL_CAPABILITY_COMMAND_INT:
            caps.append("command_int")
    if vehicle_class(hb.type) == "rover":
        caps.append("manual")
    return caps
