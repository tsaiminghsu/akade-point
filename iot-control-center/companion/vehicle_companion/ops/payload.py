"""Payload components (the ESP32 payload node, or anything else publishing
NAMED_VALUE_FLOAT) and Remote ID status.

Values are collected per component; the state reports those heard in the last
few seconds. Relay/servo commands go straight to the payload component
(component 25 by default), which ArduPilot routes to the port it lives on.
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from ..mav.command import CommandClient
from ..mav.connection import MavConnection
from ..mav.proto import mavlink

MAV_CMD_DO_SET_RELAY = 181
MAV_CMD_DO_SET_SERVO = 183
MAV_CMD_USER_1 = 31010
PAYLOAD_COMP = 25
FRESH_S = 5.0


class PayloadMonitor:
    def __init__(self, conn: MavConnection):
        self.conn = conn
        # (sysid, compid) → name → (value, monotonic time)
        self.values: dict[tuple[int, int], dict[str, tuple[float, float]]] = {}

    def on_named_value(self, msg) -> None:
        target = self.conn.target
        if target is not None and msg.get_srcSystem() != target[0]:
            return
        name = msg.name.decode("ascii", "replace") if isinstance(msg.name, bytes) else msg.name
        name = name.rstrip("\x00")
        if not name:
            return
        self.values.setdefault((msg.get_srcSystem(), msg.get_srcComponent()), {})[name] = (float(msg.value), time.monotonic())

    def state_block(self) -> Optional[list[dict]]:
        now = time.monotonic()
        out = []
        for (_sys, comp), names in sorted(self.values.items()):
            fresh = {n: round(v, 3) for n, (v, t) in sorted(names.items()) if now - t <= FRESH_S}
            if fresh:
                out.append({"comp": comp, "values": fresh})
        return out or None


class PayloadControl:
    def __init__(self, conn: MavConnection, commands: CommandClient):
        self.conn = conn
        self.commands = commands

    def _target(self, comp: int) -> tuple[int, int]:
        sysid, _ = self.conn.target_ids()
        return sysid, comp

    async def relay(self, index: int, on: bool, comp: int = PAYLOAD_COMP):
        return await self.commands.command_long(MAV_CMD_DO_SET_RELAY, [index, 1 if on else 0], target=self._target(comp))

    async def pulse(self, index: int, ms: float, comp: int = PAYLOAD_COMP):
        return await self.commands.command_long(MAV_CMD_USER_1, [index, ms], target=self._target(comp))

    async def servo(self, index: int, pwm: float, comp: int = PAYLOAD_COMP):
        return await self.commands.command_long(MAV_CMD_DO_SET_SERVO, [index, pwm], target=self._target(comp))


class RemoteId:
    """Remote ID (ArduRemoteID on an ESP32-S3/C3). Reports the module's arming
    status and, when enabled, sends the operator location ArduPilot needs
    before it will arm with Remote ID required. The operator location is the
    takeoff (home) position, the usual choice when the GCS has no GNSS."""

    def __init__(self, conn: MavConnection, send_system: bool):
        self.conn = conn
        self.send_system = send_system

    def state_block(self) -> Optional[dict]:
        found = self.conn.latest_any("OPEN_DRONE_ID_ARM_STATUS", max_age=5.0)
        if found is None:
            return None
        msg, _src = found
        err = msg.error.decode("ascii", "replace") if isinstance(msg.error, bytes) else msg.error
        return {"ok": msg.status == 0, "error": err.rstrip("\x00") or None}

    async def run(self) -> None:
        while True:
            await asyncio.sleep(1.0)
            if not self.send_system:
                continue
            home = self.conn.latest("HOME_POSITION")
            target = self.conn.target
            if home is None or target is None:
                continue
            self.conn.send(
                self.conn.mav.open_drone_id_system_encode(
                    target[0],
                    0,
                    bytes(20),
                    mavlink.MAV_ODID_OPERATOR_LOCATION_TYPE_TAKEOFF,
                    mavlink.MAV_ODID_CLASSIFICATION_TYPE_UNDECLARED,
                    home.latitude,
                    home.longitude,
                    1,
                    0,
                    -1000.0,
                    -1000.0,
                    mavlink.MAV_ODID_CATEGORY_EU_UNDECLARED,
                    mavlink.MAV_ODID_CLASS_EU_UNDECLARED,
                    home.altitude / 1000.0,
                    int(time.time() - 1546300800),  # seconds since 2019-01-01
                )
            )
