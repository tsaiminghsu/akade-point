"""Gimbal control through the autopilot (ArduPilot 4.3+ acts as the gimbal
manager; a STorM32 on MNT1_TYPE=4 sits behind it).

* Angles: MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW (1000); older firmware gets
  MAV_CMD_DO_MOUNT_CONTROL (205) in MAVLink-targeting mode.
* Modes (retract / neutral / MAVLink / RC / GPS point): DO_MOUNT_CONTROL
  param7, which ArduPilot still implements.
* Point of interest: DO_SET_ROI_LOCATION (195, COMMAND_INT) / DO_SET_ROI_NONE (197).

A STorM32 lags when commanded faster than about 10 Hz (it queues commands),
so continuous input from a slider or pad goes through GimbalStreamer, which
sends at most 10 per second and always the latest value.
"""

from __future__ import annotations

import asyncio
import math
import time
from typing import Optional

from ..mav.command import CommandClient
from ..mav.connection import MavConnection
from ..mav.proto import mavlink

MAV_CMD_DO_MOUNT_CONTROL = 205
MAV_CMD_DO_SET_ROI_LOCATION = 195
MAV_CMD_DO_SET_ROI_NONE = 197
MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW = 1000
YAW_LOCK = 16  # GIMBAL_MANAGER_FLAGS_YAW_LOCK: yaw fixed to north instead of following the vehicle

MOUNT_MODES = {"retract": 0, "neutral": 1, "mavlink": 2, "rc": 3, "gps": 4}

PITCH_RANGE = (-90.0, 30.0)
MAX_HZ = 10.0


def clamp_pitch(p: float) -> float:
    return max(PITCH_RANGE[0], min(PITCH_RANGE[1], float(p)))


def wrap_yaw(y: float) -> float:
    """Yaw in (-180, 180]."""
    y = math.fmod(float(y), 360.0)
    if y > 180:
        y -= 360
    elif y <= -180:
        y += 360
    return y


def quat_to_euler_deg(q) -> tuple[float, float, float]:
    """(roll, pitch, yaw) in degrees from a [w, x, y, z] quaternion."""
    w, x, y, z = q
    roll = math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
    sinp = max(-1.0, min(1.0, 2 * (w * y - z * x)))
    pitch = math.asin(sinp)
    yaw = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
    return math.degrees(roll), math.degrees(pitch), math.degrees(yaw)


def mount_state(conn: MavConnection, max_age: float = 3.0) -> Optional[dict]:
    """Gimbal attitude for the vehicle state: GIMBAL_DEVICE_ATTITUDE_STATUS from
    the gimbal component, or the legacy MOUNT_STATUS from the autopilot."""
    dev = conn.latest_any("GIMBAL_DEVICE_ATTITUDE_STATUS", max_age=max_age)
    if dev is not None:
        msg, _src = dev
        q = list(msg.q)
        if not any(math.isnan(v) for v in q) and any(q):
            r, p, y = quat_to_euler_deg(q)
            return {"r": round(r, 1), "p": round(p, 1), "y": round(y, 1), "src": "device"}
    ms = conn.latest("MOUNT_STATUS", max_age=max_age)
    if ms is not None:
        return {"r": round(ms.pointing_b / 100.0, 1), "p": round(ms.pointing_a / 100.0, 1), "y": round(ms.pointing_c / 100.0, 1), "src": "mount"}
    return None


def gimbal_present(conn: MavConnection) -> bool:
    if any(hb.type == mavlink.MAV_TYPE_GIMBAL for hb in conn.components().values()):
        return True
    return mount_state(conn) is not None


class GimbalControl:
    def __init__(self, conn: MavConnection, commands: CommandClient):
        self.conn = conn
        self.commands = commands

    async def pitch_yaw(self, pitch: float, yaw: float, lock: bool = False):
        p, y = clamp_pitch(pitch), wrap_yaw(yaw)
        r = await self.commands.command_long(MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW, [p, y, math.nan, math.nan, YAW_LOCK if lock else 0, 0, 0])
        if r.unsupported:
            r = await self.commands.command_long(MAV_CMD_DO_MOUNT_CONTROL, [p, 0, y, 0, 0, 0, MOUNT_MODES["mavlink"]])
        return r

    async def mode(self, name: str):
        return await self.commands.command_long(MAV_CMD_DO_MOUNT_CONTROL, [0, 0, 0, 0, 0, 0, MOUNT_MODES[name]])

    async def roi(self, lat: float, lon: float, alt: float):
        return await self.commands.command_int(
            MAV_CMD_DO_SET_ROI_LOCATION, frame=mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, params=[0], lat=lat, lon=lon, alt=alt
        )

    async def roi_none(self):
        return await self.commands.command_long(MAV_CMD_DO_SET_ROI_NONE, [0])


class GimbalStreamer:
    """Coalesces continuous gimbal input to at most MAX_HZ sends, latest value
    wins, no waiting for acks (a lost packet is replaced 100 ms later)."""

    def __init__(self, conn: MavConnection, max_hz: float = MAX_HZ):
        self.conn = conn
        self.interval = 1.0 / max_hz
        self._pending: Optional[tuple[float, float, bool]] = None
        self._last_sent = 0.0
        self._task: Optional[asyncio.Task] = None
        self.sent = 0

    def update(self, pitch: float, yaw: float, lock: bool = False) -> None:
        self._pending = (clamp_pitch(pitch), wrap_yaw(yaw), bool(lock))
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._flush(), name="gimbal-stream")

    async def _flush(self) -> None:
        while self._pending is not None:
            wait = self.interval - (time.monotonic() - self._last_sent)
            if wait > 0:
                await asyncio.sleep(wait)
            p, y, lock = self._pending
            self._pending = None
            target = self.conn.target
            if target is None:
                return
            self.conn.send(
                self.conn.mav.command_long_encode(
                    target[0], target[1], MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW, 0, p, y, math.nan, math.nan, YAW_LOCK if lock else 0, 0, 0
                )
            )
            self._last_sent = time.monotonic()
            self.sent += 1
