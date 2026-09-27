"""Joystick driving for rovers over the direct link.

The browser streams {vx, yr} (forward m/s, yaw rate rad/s) at ~10 Hz. We turn
that into SET_POSITION_TARGET_LOCAL_NED in the body frame with only velocity
and yaw rate enabled, which ArduPilot Rover follows in GUIDED and gives up on
after 3 s without a new target. On top of that, if the browser goes quiet for
DEADMAN_S we send one explicit zero so the rover stops at once rather than
coasting for three seconds.
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from ..mav.connection import MavConnection
from ..mav.proto import mavlink

# Use vx, vy, vz and yaw_rate; ignore position, acceleration and yaw.
VELOCITY_YAWRATE_MASK = 0x05C7
DEADMAN_S = 0.3
SEND_HZ = 10.0


class ManualDrive:
    def __init__(self, conn: MavConnection, *, max_speed: float = 2.0, max_yaw_rate: float = 1.5):
        self.conn = conn
        self.max_speed = max_speed
        self.max_yaw_rate = max_yaw_rate
        self._vx = 0.0
        self._yr = 0.0
        self._last_input: Optional[float] = None
        self._task: Optional[asyncio.Task] = None
        self.sent = 0

    @property
    def active(self) -> bool:
        return self._task is not None and not self._task.done()

    def update(self, vx: float, yr: float) -> None:
        self._vx = max(-self.max_speed, min(self.max_speed, float(vx)))
        self._yr = max(-self.max_yaw_rate, min(self.max_yaw_rate, float(yr)))
        self._last_input = time.monotonic()
        if not self.active:
            self._task = asyncio.create_task(self._run(), name="manual-drive")

    def stop(self) -> None:
        self._last_input = None

    def _send(self, vx: float, yr: float) -> None:
        target = self.conn.target
        if target is None:
            return
        self.conn.send(
            self.conn.mav.set_position_target_local_ned_encode(
                0, target[0], target[1], mavlink.MAV_FRAME_BODY_NED, VELOCITY_YAWRATE_MASK,
                0, 0, 0, vx, 0, 0, 0, 0, 0, 0, yr,
            )
        )
        self.sent += 1

    async def _run(self) -> None:
        try:
            while True:
                last = self._last_input
                if last is None or time.monotonic() - last > DEADMAN_S:
                    self._send(0.0, 0.0)
                    return
                self._send(self._vx, self._yr)
                await asyncio.sleep(1.0 / SEND_HZ)
        finally:
            self._task = None
