"""Whether the companion sends a GCS HEARTBEAT to the flight controller.

ArduPilot's GCS failsafe watches heartbeats from SYSID_MYGCS (MAV_GCS_SYSID
from 4.7). A companion that always sends them masks the loss of the real
ground station: the Pi keeps "being" the GCS after the operator's 4G link is
gone. So:

* ``off`` (default) — send nothing; FS_GCS follows whatever GCS the pilot uses.
* ``always`` — heartbeat while the companion runs (only for a setup that
  deliberately treats the Pi as the GCS).
* ``operator`` — heartbeat only while an operator holds control and their
  browser is demonstrably alive (direct WebSocket pong or a recent cloud poll).
  Only meaningful when SYSID_MYGCS equals the companion's source_system.
"""

from __future__ import annotations

import asyncio
from typing import Callable

from .connection import MavConnection
from .proto import mavlink

POLICIES = ("off", "always", "operator")


class GcsHeartbeat:
    def __init__(self, conn: MavConnection, policy: str = "off", operator_present: Callable[[], bool] = lambda: False):
        if policy not in POLICIES:
            raise ValueError(f"gcs_heartbeat must be one of {POLICIES}, got {policy!r}")
        self.conn = conn
        self.policy = policy
        self.operator_present = operator_present
        self.sending = False

    def should_send(self) -> bool:
        if self.policy == "always":
            return True
        if self.policy == "operator":
            return bool(self.operator_present())
        return False

    async def run(self) -> None:
        while True:
            self.sending = self.should_send()
            if self.sending and self.conn.master is not None:
                self.conn.send(
                    self.conn.mav.heartbeat_encode(
                        mavlink.MAV_TYPE_GCS,
                        mavlink.MAV_AUTOPILOT_INVALID,
                        0,
                        0,
                        mavlink.MAV_STATE_ACTIVE,
                    )
                )
            await asyncio.sleep(1.0)
