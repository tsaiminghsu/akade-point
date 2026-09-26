"""MAVLink parameter protocol: read and write single parameters, and fetch the
whole table.

Echoes are matched by name, never by index: ArduPilot answers PARAM_SET with
param_index 65535. Values are compared as float32 because that is what goes
over the wire — 0.1 set and 0.1 echoed differ as doubles.
"""

from __future__ import annotations

import asyncio
import struct
from dataclasses import dataclass
from typing import Callable, Optional

from .connection import MavConnection
from .proto import mavlink

PARAM_TYPE_NAMES = {
    1: "UINT8",
    2: "INT8",
    3: "UINT16",
    4: "INT16",
    5: "UINT32",
    6: "INT32",
    7: "UINT64",
    8: "INT64",
    9: "REAL32",
    10: "REAL64",
}
INT_TYPES = frozenset({1, 2, 3, 4, 5, 6, 7, 8})


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", float(value)))[0]


def _name(msg) -> str:
    pid = msg.param_id
    if isinstance(pid, bytes):
        pid = pid.decode("ascii", "replace")
    return pid.rstrip("\x00")


def _encode_name(name: str) -> bytes:
    return name.encode("ascii")[:16]


def display_value(value: float, ptype: int):
    """Integers come across as floats (C cast); show them as ints."""
    if ptype in INT_TYPES:
        return int(round(value))
    return round(value, 6)


@dataclass
class Param:
    name: str
    value: float
    type: int
    index: int = -1
    count: int = 0


@dataclass
class ParamSetResult:
    name: str
    ok: bool
    code: str
    value: Optional[float] = None


class ParamClient:
    def __init__(self, conn: MavConnection, *, timeout: float = 1.5, attempts: int = 3):
        self.conn = conn
        self.timeout = timeout
        self.attempts = attempts
        # Last known type per name, so a set does not need a read first.
        self.types: dict[str, int] = {}

    def _pred(self, tsys: int, name: Optional[str] = None):
        def pred(msg) -> bool:
            if msg.get_srcSystem() != tsys:
                return False
            return name is None or _name(msg) == name

        return pred

    async def get(self, name: str, *, target=None) -> Optional[Param]:
        tsys, tcomp = self.conn.target_ids(target)
        with self.conn.subscribe("PARAM_VALUE", self._pred(tsys, name)) as sub:
            for _ in range(self.attempts):
                self.conn.send(self.conn.mav.param_request_read_encode(tsys, tcomp, _encode_name(name), -1))
                msg = await sub.get(self.timeout)
                if msg is not None:
                    self.types[name] = msg.param_type
                    return Param(name, float(msg.param_value), msg.param_type, msg.param_index, msg.param_count)
        return None

    async def get_many(self, names: list[str], *, target=None) -> dict[str, Optional[Param]]:
        out: dict[str, Optional[Param]] = {}
        for name in names:
            out[name] = await self.get(name, target=target)
        return out

    async def set(self, name: str, value: float, *, param_type: Optional[int] = None, target=None) -> ParamSetResult:
        tsys, tcomp = self.conn.target_ids(target)
        ptype = param_type or self.types.get(name)
        if ptype is None:
            current = await self.get(name, target=target)
            if current is None:
                return ParamSetResult(name, False, "PARAM_NOT_FOUND")
            ptype = current.type
        want = f32(value)
        with self.conn.subscribe("PARAM_VALUE", self._pred(tsys, name)) as sub:
            for _ in range(self.attempts):
                self.conn.send(self.conn.mav.param_set_encode(tsys, tcomp, _encode_name(name), float(value), ptype))
                msg = await sub.get(self.timeout)
                if msg is None:
                    continue
                got = f32(msg.param_value)
                if got == want:
                    self.types[name] = msg.param_type
                    return ParamSetResult(name, True, "OK", got)
                # The autopilot clamped or refused the value; report what stuck.
                return ParamSetResult(name, False, "PARAM_VALUE_MISMATCH", got)
        return ParamSetResult(name, False, "TIMEOUT")

    async def fetch_all(
        self,
        *,
        target=None,
        idle_timeout: float = 2.0,
        overall_timeout: float = 180.0,
        progress: Optional[Callable[[int, int], None]] = None,
    ) -> dict[str, Param]:
        """PARAM_REQUEST_LIST, then re-request each missing index by number
        until the table is complete or we stop making progress."""
        tsys, tcomp = self.conn.target_ids(target)
        mav = self.conn.mav
        params: dict[int, Param] = {}
        total: Optional[int] = None
        loop = asyncio.get_running_loop()
        deadline = loop.time() + overall_timeout

        with self.conn.subscribe("PARAM_VALUE", self._pred(tsys)) as sub:
            self.conn.send(mav.param_request_list_encode(tsys, tcomp))
            stalls = 0
            while loop.time() < deadline:
                msg = await sub.get(idle_timeout)
                if msg is not None:
                    stalls = 0
                    if msg.param_index == 65535:
                        continue  # a set echo from someone else, not part of the list
                    total = msg.param_count
                    params[msg.param_index] = Param(_name(msg), float(msg.param_value), msg.param_type, msg.param_index, total)
                    if progress:
                        progress(len(params), total)
                    if total and len(params) >= total:
                        break
                    continue
                stalls += 1
                if stalls > self.attempts * 2:
                    break
                if total is None:
                    self.conn.send(mav.param_request_list_encode(tsys, tcomp))
                    continue
                missing = [i for i in range(total) if i not in params][:20]
                for i in missing:
                    self.conn.send(mav.param_request_read_encode(tsys, tcomp, b"", i))
        out = {p.name: p for p in params.values()}
        for name, p in out.items():
            self.types[name] = p.type
        return out
