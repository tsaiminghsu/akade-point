"""MAVLink command protocol: COMMAND_LONG / COMMAND_INT with retransmission and
COMMAND_ACK matching (https://mavlink.io/en/services/command.html)."""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from typing import Optional, Sequence

from .connection import MavConnection
from .proto import mavlink

MAV_RESULT_NAMES = {
    0: "MAV_RESULT_ACCEPTED",
    1: "MAV_RESULT_TEMPORARILY_REJECTED",
    2: "MAV_RESULT_DENIED",
    3: "MAV_RESULT_UNSUPPORTED",
    4: "MAV_RESULT_FAILED",
    5: "MAV_RESULT_IN_PROGRESS",
    6: "MAV_RESULT_CANCELLED",
    7: "MAV_RESULT_COMMAND_LONG_ONLY",
    8: "MAV_RESULT_COMMAND_INT_ONLY",
    9: "MAV_RESULT_COMMAND_UNSUPPORTED_MAV_FRAME",
}


@dataclass
class CommandResult:
    command: int
    result: Optional[int]  # None = no ack before the deadline
    progress: int = 0
    result_param2: int = 0

    @property
    def ok(self) -> bool:
        return self.result == mavlink.MAV_RESULT_ACCEPTED

    @property
    def code(self) -> str:
        if self.result is None:
            return "TIMEOUT"
        return MAV_RESULT_NAMES.get(self.result, f"MAV_RESULT_{self.result}")

    @property
    def unsupported(self) -> bool:
        """The autopilot does not implement this command in this form, so a
        caller should try its fallback."""
        return self.result in (
            mavlink.MAV_RESULT_UNSUPPORTED,
            7,  # COMMAND_LONG_ONLY
            8,  # COMMAND_INT_ONLY
            9,  # UNSUPPORTED_MAV_FRAME
        )


def _pad7(params: Sequence[float]) -> list[float]:
    p = [float(x) for x in params][:7]
    return p + [0.0] * (7 - len(p))


class CommandClient:
    def __init__(self, conn: MavConnection):
        self.conn = conn

    def _ack_predicate(self, command: int, tsys: int):
        own = self.conn.source_system

        def pred(ack) -> bool:
            if ack.command != command or ack.get_srcSystem() != tsys:
                return False
            # Acks addressed to another GCS (Mission Planner through the router)
            # carry its sysid; 0 means the autopilot did not fill the field.
            return getattr(ack, "target_system", 0) in (0, own)

        return pred

    async def _await_ack(self, sub, command: int, send, attempt_timeout: float, attempts: int, in_progress_timeout: float) -> CommandResult:
        for attempt in range(attempts):
            send(attempt)
            ack = await sub.get(attempt_timeout)
            if ack is None:
                continue
            if ack.result == mavlink.MAV_RESULT_IN_PROGRESS:
                # Long-running command: keep listening for the final ack.
                loop = asyncio.get_running_loop()
                deadline = loop.time() + in_progress_timeout
                while True:
                    remaining = deadline - loop.time()
                    if remaining <= 0:
                        return CommandResult(command, None, ack.progress)
                    nxt = await sub.get(remaining)
                    if nxt is None:
                        return CommandResult(command, None, ack.progress)
                    if nxt.result != mavlink.MAV_RESULT_IN_PROGRESS:
                        return CommandResult(command, nxt.result, nxt.progress, getattr(nxt, "result_param2", 0))
                    ack = nxt
            return CommandResult(command, ack.result, getattr(ack, "progress", 0), getattr(ack, "result_param2", 0))
        return CommandResult(command, None)

    async def command_long(
        self,
        command: int,
        params: Sequence[float] = (),
        *,
        target: Optional[tuple[int, int]] = None,
        attempt_timeout: float = 1.5,
        attempts: int = 3,
        in_progress_timeout: float = 30.0,
    ) -> CommandResult:
        tsys, tcomp = self.conn.target_ids(target)
        p = _pad7(params)
        with self.conn.subscribe("COMMAND_ACK", self._ack_predicate(command, tsys)) as sub:

            def send(confirmation: int) -> None:
                self.conn.send(self.conn.mav.command_long_encode(tsys, tcomp, command, confirmation, *p))

            return await self._await_ack(sub, command, send, attempt_timeout, attempts, in_progress_timeout)

    async def command_int(
        self,
        command: int,
        *,
        frame: int,
        params: Sequence[float] = (),
        lat: float = 0.0,
        lon: float = 0.0,
        alt: float = 0.0,
        scale_xy: bool = True,
        target: Optional[tuple[int, int]] = None,
        attempt_timeout: float = 1.5,
        attempts: int = 3,
        in_progress_timeout: float = 30.0,
    ) -> CommandResult:
        """COMMAND_INT. lat/lon are degrees (scaled to 1e7) unless scale_xy is
        False. COMMAND_INT has no confirmation field, so a retry is a resend."""
        tsys, tcomp = self.conn.target_ids(target)
        p = [float(x) for x in params][:4]
        p += [0.0] * (4 - len(p))
        x = int(round(lat * 1e7)) if scale_xy else int(lat)
        y = int(round(lon * 1e7)) if scale_xy else int(lon)
        with self.conn.subscribe("COMMAND_ACK", self._ack_predicate(command, tsys)) as sub:

            def send(_attempt: int) -> None:
                self.conn.send(self.conn.mav.command_int_encode(tsys, tcomp, frame, command, 0, 0, *p, x, y, float(alt)))

            return await self._await_ack(sub, command, send, attempt_timeout, attempts, in_progress_timeout)


NAN = math.nan
