"""Thin wrapper over a pymavlink connection: a reader thread that caches the
latest message of each type, plus helpers to send commands and wait for their
COMMAND_ACK. Kept small so commands.py and mission.py can be unit-tested against
a fake link with the same surface."""

from __future__ import annotations

import threading
import time
from typing import Callable, Optional


class MavlinkLink:
    def __init__(self, url: str, source_system: int = 253):
        # Imported here so the module can be imported (and unit-tested with a
        # fake link) on a machine without pymavlink installed.
        from pymavlink import mavutil

        self.mavutil = mavutil
        self.master = mavutil.mavlink_connection(url, source_system=source_system)
        self._latest: dict[str, object] = {}
        self._lock = threading.Lock()
        self._running = False
        self._reader: Optional[threading.Thread] = None
        # Called with the raw bytes of every inbound message (for UDP fan-out).
        self.on_raw: Optional[Callable[[bytes], None]] = None

    def wait_heartbeat(self, timeout: float = 30.0) -> bool:
        self.master.wait_heartbeat(timeout=timeout)
        return True

    def start(self) -> None:
        self._running = True
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def stop(self) -> None:
        self._running = False

    def _read_loop(self) -> None:
        while self._running:
            msg = self.master.recv_match(blocking=True, timeout=1.0)
            if msg is None:
                continue
            mtype = msg.get_type()
            if mtype == "BAD_DATA":
                continue
            with self._lock:
                self._latest[mtype] = msg
            if self.on_raw is not None:
                buf = msg.get_msgbuf()
                if buf:
                    self.on_raw(bytes(buf))

    def latest(self, mtype: str):
        with self._lock:
            return self._latest.get(mtype)

    def write_raw(self, data: bytes) -> None:
        """Injects bytes from an external UDP peer (MissionPlanner) into the FC."""
        try:
            self.master.write(data)
        except Exception:
            pass

    # ---- command helpers -------------------------------------------------

    def set_mode(self, mode_name: str) -> bool:
        mapping = self.master.mode_mapping() or {}
        mode_id = mapping.get(mode_name)
        if mode_id is None:
            return False
        self.master.mav.set_mode_send(
            self.master.target_system,
            self.mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
            mode_id,
        )
        return self._wait_mode(mode_name)

    def _wait_mode(self, mode_name: str, timeout: float = 5.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            hb = self.latest("HEARTBEAT")
            if hb is not None:
                cur = self.master.flightmode
                if cur == mode_name:
                    return True
            time.sleep(0.1)
        return False

    def command_long(self, command: int, *params: float, timeout: float = 10.0):
        """Sends a COMMAND_LONG and waits for the matching COMMAND_ACK. Returns
        the MAV_RESULT int, or None on timeout."""
        p = list(params) + [0.0] * (7 - len(params))
        self.master.mav.command_long_send(
            self.master.target_system, self.master.target_component, command, 0, *p[:7]
        )
        deadline = time.time() + timeout
        while time.time() < deadline:
            ack = self.master.recv_match(type="COMMAND_ACK", blocking=True, timeout=1.0)
            if ack is not None and ack.command == command:
                return ack.result
        return None
