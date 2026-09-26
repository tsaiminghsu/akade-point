"""Runs commands in three lanes so a slow operation never blocks a safety one.

* priority — disarm, RTL, land, hold, mission pause. They run at once: a
  queued or running normal command is cancelled first (acked PREEMPTED), so a
  goto issued before RTL can never execute after it.
* fast — everything else that talks to the autopilot briefly, one at a time.
* slow — mission/fence/rally transfers and parameter batches, one at a time,
  independent of the other two lanes.

Commands are deduplicated by id (the server resends a command every second
until it is acked). A duplicate of a finished command re-sends the stored ack:
if the first ack POST was lost, that is how the server finally hears it.
Commands past their expiry are refused instead of run late.
"""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from typing import Callable, Optional

from ..clock import Clock

log = logging.getLogger(__name__)

PRIORITY = frozenset({"disarm", "rtl", "land", "hold", "mission_pause"})
# Gimbal commands are quick and independent of flight commands; they never
# wait behind a slow goto or preempt one.
GIMBAL = frozenset({"gimbal_pitchyaw", "gimbal_mode", "roi_location", "roi_none"})
SLOW = frozenset({"mission_upload", "mission_download", "mission_clear", "param_get", "param_set", "param_fetch"})

DEFAULT_TIMEOUT_S = 15.0
TYPE_TIMEOUT_S = {
    "takeoff": 30.0,
    "mission_upload": 120.0,
    "mission_download": 120.0,
    "mission_clear": 20.0,
    "param_get": 60.0,
    "param_set": 120.0,
    "param_fetch": 240.0,
}
# Allowance for delivery latency and clock error when checking expiry.
EXPIRY_GRACE_MS = 1500


def lane_of(ctype: str) -> str:
    if ctype in PRIORITY:
        return "priority"
    if ctype in SLOW:
        return "slow"
    if ctype in GIMBAL:
        return "gimbal"
    return "fast"


class Executor:
    def __init__(self, handlers, ack_sink: Callable[[dict], None], clock: Clock, *, seen_max: int = 512):
        self.handlers = handlers
        self.ack_sink = ack_sink
        self.clock = clock
        self.seen_max = seen_max
        self._seen: OrderedDict[str, Optional[dict]] = OrderedDict()
        self._queues = {"priority": asyncio.Queue(), "fast": asyncio.Queue(), "slow": asyncio.Queue(), "gimbal": asyncio.Queue()}
        self._fast_current: Optional[tuple[dict, asyncio.Task]] = None
        self._preempted: set[str] = set()
        self._listeners: list[Callable[[dict, dict], None]] = []

    def on_finished(self, fn: Callable[[dict, dict], None]) -> None:
        """fn(cmd, ack) after every command, e.g. to audit direct-link commands."""
        self._listeners.append(fn)

    # ---- intake --------------------------------------------------------

    def submit(self, cmd: dict) -> None:
        cid = cmd.get("id")
        ctype = cmd.get("type")
        if not cid or not ctype:
            log.warning("ignoring malformed command %r", cmd)
            return
        if cid in self._seen:
            ack = self._seen[cid]
            self._seen.move_to_end(cid)
            if ack is not None:
                self.ack_sink(ack)
            return
        self._seen[cid] = None
        while len(self._seen) > self.seen_max:
            self._seen.popitem(last=False)

        if self.expired(cmd):
            self._finish(cmd, self.handlers.ack(cid, False, "EXPIRED", "command arrived after its deadline"))
            return

        lane = lane_of(ctype)
        if lane == "priority":
            self._preempt_fast(f"preempted by {ctype}")
        self._queues[lane].put_nowait(cmd)

    def expired(self, cmd: dict) -> bool:
        if not self.clock.synced:
            return False
        exp = cmd.get("exp")
        if exp is None:
            iat, to = cmd.get("iat"), cmd.get("to")
            if iat is None or to is None:
                return False
            exp = iat + to
        return self.clock.now_ms() > exp + EXPIRY_GRACE_MS

    def _preempt_fast(self, reason: str) -> None:
        q = self._queues["fast"]
        while not q.empty():
            queued = q.get_nowait()
            self._finish(queued, self.handlers.ack(queued["id"], False, "PREEMPTED", reason))
        if self._fast_current is not None:
            cmd, task = self._fast_current
            if not task.done():
                self._preempted.add(cmd["id"])
                task.cancel()

    # ---- workers -------------------------------------------------------

    async def run(self) -> None:
        await asyncio.gather(*(self._worker(lane) for lane in self._queues))

    async def _worker(self, lane: str) -> None:
        q = self._queues[lane]
        while True:
            cmd = await q.get()
            if self.expired(cmd):
                self._finish(cmd, self.handlers.ack(cmd["id"], False, "EXPIRED", "command waited past its deadline"))
                continue
            task = asyncio.create_task(self._execute(cmd), name=f"cmd-{cmd['type']}")
            if lane == "fast":
                self._fast_current = (cmd, task)
            try:
                await asyncio.wait({task})
            finally:
                if lane == "fast":
                    self._fast_current = None
            if task.cancelled():
                reason = "preempted by a safety command" if cmd["id"] in self._preempted else "cancelled"
                self._preempted.discard(cmd["id"])
                ack = self.handlers.ack(cmd["id"], False, "PREEMPTED", reason)
            elif task.exception() is not None:
                exc = task.exception()
                log.error("command %s crashed: %r", cmd.get("type"), exc)
                ack = self.handlers.ack(cmd["id"], False, "EXECUTOR_ERROR", repr(exc))
            else:
                ack = task.result()
            self._finish(cmd, ack)

    async def _execute(self, cmd: dict) -> dict:
        timeout = TYPE_TIMEOUT_S.get(cmd["type"], DEFAULT_TIMEOUT_S)
        to = cmd.get("to")
        if isinstance(to, (int, float)) and to > 0:
            timeout = max(timeout, to / 1000.0)
        try:
            return await asyncio.wait_for(self.handlers.run(cmd), timeout)
        except asyncio.TimeoutError:
            return self.handlers.ack(cmd["id"], False, "TIMEOUT", f"no result within {timeout:.0f}s")

    def _finish(self, cmd: dict, ack: dict) -> None:
        cid = cmd["id"]
        if cid in self._seen:
            self._seen[cid] = ack
        log.info("%s %s -> %s %s", cmd.get("type"), cid, ack.get("st"), ack.get("code"))
        self.ack_sink(ack)
        for fn in self._listeners:
            try:
                fn(cmd, ack)
            except Exception:
                log.exception("finished-listener failed")
