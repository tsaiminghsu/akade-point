"""Telemetry rates. We ask for each message explicitly with
MAV_CMD_SET_MESSAGE_INTERVAL and keep re-asserting the rates: the flight
controller's serial port is shared with Mission Planner through
mavlink-router, and Mission Planner's REQUEST_DATA_STREAM overrides them."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .command import CommandClient
from .connection import MavConnection
from .proto import mavlink

log = logging.getLogger(__name__)

MAV_CMD_SET_MESSAGE_INTERVAL = 511
MAV_CMD_REQUEST_MESSAGE = 512
MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES = 520

# Hz per message. Tuned for a 1 Hz cloud link plus a 10 Hz direct link; the
# direct link raises ATTITUDE while a browser is attached.
DEFAULT_RATES: dict[str, float] = {
    "ATTITUDE": 4,
    "GLOBAL_POSITION_INT": 4,
    "VFR_HUD": 4,
    "SYS_STATUS": 2,
    "BATTERY_STATUS": 1,
    "GPS_RAW_INT": 2,
    "EKF_STATUS_REPORT": 1,
    "VIBRATION": 1,
    "NAV_CONTROLLER_OUTPUT": 2,
    "MISSION_CURRENT": 1,
    "HOME_POSITION": 0.2,
    "RC_CHANNELS": 1,
    "FENCE_STATUS": 1,
    "WIND": 1,
    "SYSTEM_TIME": 0.2,
    # Gimbal attitude, forwarded by ArduPilot's gimbal manager (ignored when there is no gimbal).
    "GIMBAL_DEVICE_ATTITUDE_STATUS": 2,
}


def msg_id(name: str) -> int:
    return getattr(mavlink, f"MAVLINK_MSG_ID_{name}")


class StreamManager:
    def __init__(self, conn: MavConnection, commands: CommandClient, rates: Optional[dict[str, float]] = None, reassert_s: float = 20.0):
        self.conn = conn
        self.commands = commands
        self.rates = dict(rates or DEFAULT_RATES)
        self.reassert_s = reassert_s
        self._boost: dict[str, float] = {}
        self._wake = asyncio.Event()
        self._versioned_target = None

    def boost(self, name: str, hz: Optional[float]) -> None:
        """Temporarily raise (or with None, restore) one message's rate."""
        if hz is None:
            self._boost.pop(name, None)
        else:
            self._boost[name] = hz
        self._wake.set()

    def effective_rates(self) -> dict[str, float]:
        out = dict(self.rates)
        for name, hz in self._boost.items():
            out[name] = max(out.get(name, 0), hz)
        return out

    async def request_message(self, name: str) -> bool:
        res = await self.commands.command_long(MAV_CMD_REQUEST_MESSAGE, [msg_id(name)], attempts=2, attempt_timeout=1.0)
        if res.ok:
            return True
        if name == "AUTOPILOT_VERSION" and res.unsupported:
            res = await self.commands.command_long(MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES, [1], attempts=2, attempt_timeout=1.0)
            return res.ok
        return False

    async def apply_once(self) -> None:
        for name, hz in self.effective_rates().items():
            interval_us = -1 if hz <= 0 else int(1_000_000 / hz)
            res = await self.commands.command_long(MAV_CMD_SET_MESSAGE_INTERVAL, [msg_id(name), interval_us], attempts=1, attempt_timeout=0.8)
            if not res.ok:
                log.debug("SET_MESSAGE_INTERVAL %s -> %s", name, res.code)

    async def run(self) -> None:
        while True:
            target = await self.conn.wait_target()
            try:
                if target != self._versioned_target:
                    if await self.request_message("AUTOPILOT_VERSION"):
                        self._versioned_target = target
                    await self.request_message("HOME_POSITION")
                await self.apply_once()
            except Exception:
                log.exception("stream setup failed")
            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), self.reassert_s)
            except asyncio.TimeoutError:
                pass
