"""Assembles the vehicle state the ground station shows (contract v2), and the
older v1 shape the current server still accepts.

Rule: anything we do not know is None, never 0. Mission Planner shows a
missing battery reading as 0 V and then announces it; a value is only
reported while the message it came from is fresh, otherwise it becomes None.
"""

from __future__ import annotations

import math
from typing import Callable, Optional

from .mav.connection import MavConnection
from .mav.proto import mavlink
from .mav.statustext import StatusLog
from .ops.gimbal import gimbal_present, mount_state
from .mav.vehicle import (
    MAV_STATE_NAMES,
    autopilot_family,
    capabilities,
    firmware_string,
    is_armed,
    mode_name,
    vehicle_class,
)

# Seconds after which a message group is treated as unknown.
FAST_MAX_AGE = 3.0
MID_MAX_AGE = 5.0
SLOW_MAX_AGE = 10.0
HOME_MAX_AGE = 600.0

U16_UNKNOWN = 65535

SENSOR_NAMES = {
    1: "gyro",
    2: "accel",
    4: "mag",
    8: "baro",
    16: "airspeed",
    32: "gps",
    64: "flow",
    128: "vision",
    256: "laser",
    512: "ext_ground_truth",
    1024: "rate_control",
    2048: "attitude_control",
    4096: "yaw_control",
    8192: "alt_control",
    16384: "pos_control",
    32768: "motors",
    65536: "rc",
    131072: "gyro2",
    262144: "accel2",
    524288: "mag2",
    1048576: "geofence",
    2097152: "ahrs",
    4194304: "terrain",
    8388608: "reverse_motor",
    16777216: "logging",
    33554432: "battery",
    67108864: "proximity",
    134217728: "satcom",
    536870912: "avoidance",
    1073741824: "propulsion",
}
PREARM_BIT = mavlink.MAV_SYS_STATUS_PREARM_CHECK


def _r(value, digits: int = 2):
    return None if value is None else round(float(value), digits)


def unhealthy_sensors(present: int, enabled: int, health: int) -> list[str]:
    bad = present & enabled & ~health & ~PREARM_BIT
    return [name for bit, name in SENSOR_NAMES.items() if bad & bit]


def prearm_ok(present: int, enabled: int, health: int) -> Optional[bool]:
    if not (present & PREARM_BIT and enabled & PREARM_BIT):
        return None
    return bool(health & PREARM_BIT)


def battery_block(sys_status, battery_status, cells_config: int) -> Optional[dict]:
    if sys_status is None and battery_status is None:
        return None
    volts = amps = pct = mah = None
    if sys_status is not None:
        mv = sys_status.voltage_battery
        if mv not in (0, U16_UNKNOWN):
            volts = mv / 1000.0
        if sys_status.current_battery != -1:
            amps = sys_status.current_battery / 100.0
        if sys_status.battery_remaining != -1:
            pct = float(sys_status.battery_remaining)
    cells = cell_v = None
    cell_avg = False
    if battery_status is not None:
        if battery_status.battery_remaining != -1:
            pct = float(battery_status.battery_remaining)
        if battery_status.current_consumed != -1:
            mah = float(battery_status.current_consumed)
        per_cell = [v for v in battery_status.voltages if v not in (U16_UNKNOWN, 0)]
        per_cell += [v for v in getattr(battery_status, "voltages_ext", []) or [] if v not in (U16_UNKNOWN, 0)]
        # A smart battery reports one entry per cell; an analog power module
        # reports the whole pack in voltages[0].
        if len(per_cell) > 1 and all(v < 5000 for v in per_cell):
            cells = len(per_cell)
            cell_v = min(per_cell) / 1000.0
            if volts is None:
                volts = sum(per_cell) / 1000.0
    if cell_v is None and volts is not None and cells_config > 0:
        cells = cells_config
        cell_v = volts / cells_config
        cell_avg = True
    return {
        "v": _r(volts),
        "a": _r(amps),
        "pct": _r(pct, 0),
        "mah": _r(mah, 0),
        "cells": cells,
        "cellV": _r(cell_v, 3),
        "cellAvg": cell_avg,
    }


class StateBuilder:
    def __init__(
        self,
        conn: MavConnection,
        status: StatusLog,
        now_ms: Callable[[], int],
        *,
        battery_cells: int = 0,
        sysinfo=None,
        gcs_state: Callable[[], dict] = lambda: {},
        video_state: Callable[[], Optional[dict]] = lambda: None,
        payload_state: Callable[[], Optional[list]] = lambda: None,
        rid_state: Callable[[], Optional[dict]] = lambda: None,
        adsb_state: Callable[[], Optional[list]] = lambda: None,
        logdl_state: Callable[[], Optional[dict]] = lambda: None,
    ):
        self.conn = conn
        self.status = status
        self.now_ms = now_ms
        self.battery_cells = battery_cells
        self.sysinfo = sysinfo
        self.gcs_state = gcs_state
        self.video_state = video_state
        self.payload_state = payload_state
        self.rid_state = rid_state
        self.adsb_state = adsb_state
        self.logdl_state = logdl_state

    def build(self) -> dict:
        c = self.conn
        hb = c.heartbeat()
        target = c.target
        fc_age = c.age("HEARTBEAT")
        linked = hb is not None
        # With the flight controller silent, every live value is unknown.
        latest = (lambda t, age: c.latest(t, max_age=age)) if linked else (lambda t, age: None)

        att = latest("ATTITUDE", FAST_MAX_AGE)
        gpi = latest("GLOBAL_POSITION_INT", FAST_MAX_AGE)
        vfr = latest("VFR_HUD", FAST_MAX_AGE)
        sys_status = latest("SYS_STATUS", MID_MAX_AGE)
        battery_status = latest("BATTERY_STATUS", SLOW_MAX_AGE)
        gps = latest("GPS_RAW_INT", MID_MAX_AGE)
        mc = latest("MISSION_CURRENT", SLOW_MAX_AGE)
        nav = latest("NAV_CONTROLLER_OUTPUT", MID_MAX_AGE)
        ekf = latest("EKF_STATUS_REPORT", SLOW_MAX_AGE)
        vib = latest("VIBRATION", SLOW_MAX_AGE)
        rc = latest("RC_CHANNELS", SLOW_MAX_AGE)
        fence = latest("FENCE_STATUS", SLOW_MAX_AGE)
        wind = latest("WIND", SLOW_MAX_AGE)
        home = c.latest("HOME_POSITION", max_age=HOME_MAX_AGE)
        version = c.latest("AUTOPILOT_VERSION")
        radio = c.latest_any("RADIO_STATUS", max_age=SLOW_MAX_AGE)

        pos = None
        if gpi is not None and not (gpi.lat == 0 and gpi.lon == 0):
            pos = {
                "lat": round(gpi.lat / 1e7, 7),
                "lon": round(gpi.lon / 1e7, 7),
                "alt": round(gpi.alt / 1000.0, 2),
                "rel": round(gpi.relative_alt / 1000.0, 2),
            }
        hdg = None
        if gpi is not None and gpi.hdg != U16_UNKNOWN:
            hdg = round(gpi.hdg / 100.0, 1)
        elif vfr is not None:
            hdg = float(vfr.heading)

        health = {"prearm": None, "bad": [], "msgs": self.status.prearm_failures()}
        if sys_status is not None:
            p, e, h = (
                sys_status.onboard_control_sensors_present,
                sys_status.onboard_control_sensors_enabled,
                sys_status.onboard_control_sensors_health,
            )
            health["prearm"] = prearm_ok(p, e, h)
            health["bad"] = unhealthy_sensors(p, e, h)

        gps_block = None
        if gps is not None:
            gps_block = {
                "fix": int(gps.fix_type),
                "sats": None if gps.satellites_visible == 255 else int(gps.satellites_visible),
                "hdop": None if gps.eph == U16_UNKNOWN else round(gps.eph / 100.0, 2),
            }

        wp = None
        if mc is not None:
            total = getattr(mc, "total", U16_UNKNOWN)
            wp = {
                "cur": int(mc.seq),
                "n": None if total in (U16_UNKNOWN, None) else int(total),
                "dist": None if nav is None else int(nav.wp_dist),
                "xt": None if nav is None else round(nav.xtrack_error, 1),
            }

        ekf_block = None
        if ekf is not None:
            variances = [ekf.velocity_variance, ekf.pos_horiz_variance, ekf.pos_vert_variance, ekf.compass_variance]
            ekf_block = {
                "flags": int(ekf.flags),
                "vel": round(ekf.velocity_variance, 3),
                "posH": round(ekf.pos_horiz_variance, 3),
                "posV": round(ekf.pos_vert_variance, 3),
                "compass": round(ekf.compass_variance, 3),
                "terrain": round(ekf.terrain_alt_variance, 3),
                "worst": round(max(variances), 3),
            }

        radio_block = None
        if radio is not None:
            r = radio[0]
            radio_block = {
                "rssi": r.rssi,
                "remrssi": r.remrssi,
                "noise": r.noise,
                "remnoise": r.remnoise,
                "rxerr": r.rxerrors,
                "fixed": r.fixed,
            }

        return {
            "v": 2,
            "t": self.now_ms(),
            "fc": {"ok": linked, "age": _r(fc_age, 1), "id": list(target) if target else None},
            "veh": None
            if hb is None
            else {"cls": vehicle_class(hb.type), "ap": autopilot_family(hb.autopilot), "mavType": int(hb.type)},
            "armed": None if hb is None else is_armed(hb),
            "mode": None if hb is None else mode_name(hb),
            "sys": None if hb is None else MAV_STATE_NAMES.get(hb.system_status, str(hb.system_status)),
            "att": None
            if att is None
            else {
                "r": round(math.degrees(att.roll), 1),
                "p": round(math.degrees(att.pitch), 1),
                "y": round(math.degrees(att.yaw) % 360, 1),
            },
            "bat": battery_block(sys_status, battery_status, self.battery_cells),
            "gps": gps_block,
            "pos": pos,
            "home": None
            if home is None
            else {
                "lat": round(home.latitude / 1e7, 7),
                "lon": round(home.longitude / 1e7, 7),
                "alt": round(home.altitude / 1000.0, 2),
            },
            "hdg": hdg,
            "gs": None if vfr is None else round(vfr.groundspeed, 2),
            "as": None if vfr is None else round(vfr.airspeed, 2),
            "vs": None if vfr is None else round(vfr.climb, 2),
            "thr": None if vfr is None else int(vfr.throttle),
            "wp": wp,
            "ekf": ekf_block,
            "vibe": None
            if vib is None
            else {
                "x": round(vib.vibration_x, 1),
                "y": round(vib.vibration_y, 1),
                "z": round(vib.vibration_z, 1),
                "clip": [int(vib.clipping_0), int(vib.clipping_1), int(vib.clipping_2)],
            },
            "rssi": {
                "rc": None if rc is None or rc.rssi == 255 else round(rc.rssi / 254 * 100),
                "radio": radio_block,
            },
            "health": health,
            "fence": None
            if fence is None
            else {"breach": bool(fence.breach_status), "count": int(fence.breach_count), "type": int(fence.breach_type)},
            "wind": None if wind is None else {"dir": round(wind.direction, 0), "spd": round(wind.speed, 1)},
            "mount": mount_state(c) if linked else None,
            "comp": dict(self.sysinfo.snapshot) if self.sysinfo is not None else None,
            "caps": capabilities(version, hb)
            + (["gimbal"] if linked and gimbal_present(c) else [])
            + (["payload"] if linked and self.payload_state() else []),
            "gcs": {"others": len(c.other_gcs()), **self.gcs_state()},
            "video": self.video_state(),
            "payload": self.payload_state() if linked else None,
            "adsb": self.adsb_state() if linked else None,
            "logdl": self.logdl_state(),
            "rid": self.rid_state() if linked else None,
            "fw": firmware_string(version, hb),
        }


def to_v1(s: dict) -> dict:
    """Projects a v2 state onto the v1 contract (all numbers, no nulls) for
    servers that have not been upgraded yet."""
    bat = s.get("bat") or {}
    gps = s.get("gps") or {}
    pos = s.get("pos") or {}
    wp = s.get("wp") or {}

    def num(v, default=0.0):
        return default if v is None else v

    return {
        "v": 1,
        "t": s["t"],
        "armed": bool(s.get("armed")),
        "mode": s.get("mode") or "UNKNOWN",
        "sys": s.get("sys") or "UNINIT",
        "bat": {"pct": num(bat.get("pct")), "v": num(bat.get("v")), "a": num(bat.get("a"))},
        "gps": {"fix": int(num(gps.get("fix"), 0)), "sats": int(num(gps.get("sats"), 0)), "hdop": num(gps.get("hdop"), 99.9)},
        "pos": {"lat": num(pos.get("lat")), "lon": num(pos.get("lon")), "alt": num(pos.get("alt")), "rel": num(pos.get("rel"))},
        "hdg": num(s.get("hdg")),
        "gs": num(s.get("gs")),
        "vs": num(s.get("vs")),
        "wp": {"cur": int(num(wp.get("cur"), 0)), "n": int(num(wp.get("n"), 0))},
        "fw": s.get("fw") or "unknown",
    }
