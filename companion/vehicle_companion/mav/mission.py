"""MAVLink mission protocol for all three plans: the flight mission (type 0),
the geofence (type 1) and rally points (type 2).

Items are the JSON dicts the server stores (seq, cur, frame, cmd, p1..p4,
lat, lon, alt, ac). Only the flight mission has a home item at seq 0; fence and
rally plans start directly with their first item. Sequence numbers are
rewritten from list position on upload so a gap in the stored data can never
desynchronise the handshake.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

from .connection import MavConnection
from .proto import mavlink

MISSION = mavlink.MAV_MISSION_TYPE_MISSION
FENCE = mavlink.MAV_MISSION_TYPE_FENCE
RALLY = mavlink.MAV_MISSION_TYPE_RALLY
MISSION_TYPES = {MISSION: "mission", FENCE: "fence", RALLY: "rally"}

MISSION_RESULT_NAMES = {int(k): v.name for k, v in mavlink.enums["MAV_MISSION_RESULT"].items()}

# Frames whose x/y are latitude/longitude (scaled by 1e7 in *_INT messages).
GLOBAL_FRAMES = frozenset({0, 3, 5, 6, 10, 11})
# MAV_FRAME_MISSION: x/y are plain parameters 5 and 6, sent unscaled.
FRAME_MISSION = 2


def encode_xy(frame: int, lat: float, lon: float) -> tuple[int, int]:
    if frame in GLOBAL_FRAMES:
        return int(round(lat * 1e7)), int(round(lon * 1e7))
    if frame == FRAME_MISSION:
        return int(round(lat)), int(round(lon))
    return int(round(lat * 1e4)), int(round(lon * 1e4))  # local frames: metres * 1e4


def decode_xy(frame: int, x: float, y: float, is_int: bool) -> tuple[float, float]:
    if not is_int:
        return float(x), float(y)
    if frame in GLOBAL_FRAMES:
        return round(x / 1e7, 7), round(y / 1e7, 7)
    if frame == FRAME_MISSION:
        return float(x), float(y)
    return x / 1e4, y / 1e4


@dataclass
class MissionResult:
    ok: bool
    code: str
    count: int = 0
    items: list[dict] = field(default_factory=list)


class MissionError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


class MissionClient:
    def __init__(self, conn: MavConnection, *, item_timeout: float = 2.0, retries: int = 5):
        self.conn = conn
        self.item_timeout = item_timeout
        self.retries = retries

    def _from_vehicle(self, tsys: int, mission_type: int):
        def pred(msg) -> bool:
            return msg.get_srcSystem() == tsys and getattr(msg, "mission_type", 0) == mission_type

        return pred

    async def upload(self, items: list[dict], mission_type: int = MISSION, *, target=None) -> MissionResult:
        tsys, tcomp = self.conn.target_ids(target)
        n = len(items)
        mav = self.conn.mav

        def item_msg(seq: int):
            it = items[seq]
            frame = int(it["frame"])
            x, y = encode_xy(frame, float(it["lat"]), float(it["lon"]))
            return mav.mission_item_int_encode(
                tsys,
                tcomp,
                seq,
                frame,
                int(it["cmd"]),
                1 if (mission_type == MISSION and seq == 0 and int(it.get("cur", 0))) else int(it.get("cur", 0)),
                int(it.get("ac", 1)),
                float(it.get("p1", 0)),
                float(it.get("p2", 0)),
                float(it.get("p3", 0)),
                float(it.get("p4", 0)),
                x,
                y,
                float(it.get("alt", 0)),
                mission_type,
            )

        types = ("MISSION_REQUEST_INT", "MISSION_REQUEST", "MISSION_ACK")
        with self.conn.subscribe(types, self._from_vehicle(tsys, mission_type)) as sub:
            count_msg = mav.mission_count_encode(tsys, tcomp, n, mission_type)
            last = count_msg
            self.conn.send(count_msg)
            misses = 0
            try:
                while True:
                    msg = await sub.get(self.item_timeout)
                    if msg is None:
                        misses += 1
                        if misses > self.retries:
                            return MissionResult(False, "TIMEOUT", n)
                        self.conn.send(last)  # our last packet was probably lost
                        continue
                    misses = 0
                    if msg.get_type() == "MISSION_ACK":
                        if msg.type == mavlink.MAV_MISSION_ACCEPTED:
                            return MissionResult(True, "MAV_MISSION_ACCEPTED", n)
                        return MissionResult(False, MISSION_RESULT_NAMES.get(msg.type, f"MAV_MISSION_{msg.type}"), n)
                    seq = msg.seq
                    if seq < 0 or seq >= n:
                        self.conn.send(mav.mission_ack_encode(tsys, tcomp, mavlink.MAV_MISSION_INVALID_SEQUENCE, mission_type))
                        return MissionResult(False, "MAV_MISSION_INVALID_SEQUENCE", n)
                    last = item_msg(seq)
                    self.conn.send(last)
            except asyncio.CancelledError:
                self.conn.send(mav.mission_ack_encode(tsys, tcomp, mavlink.MAV_MISSION_OPERATION_CANCELLED, mission_type))
                raise

    async def download(self, mission_type: int = MISSION, *, target=None) -> MissionResult:
        tsys, tcomp = self.conn.target_ids(target)
        mav = self.conn.mav
        pred = self._from_vehicle(tsys, mission_type)

        with self.conn.subscribe("MISSION_COUNT", pred) as sub:
            count = None
            for _ in range(self.retries + 1):
                self.conn.send(mav.mission_request_list_encode(tsys, tcomp, mission_type))
                msg = await sub.get(self.item_timeout)
                if msg is not None:
                    count = msg.count
                    break
            if count is None:
                return MissionResult(False, "TIMEOUT")

        items: list[dict] = []
        try:
            for seq in range(count):
                item = None
                with self.conn.subscribe(("MISSION_ITEM_INT", "MISSION_ITEM"), lambda m, s=seq: pred(m) and m.seq == s) as sub:
                    for _ in range(self.retries + 1):
                        self.conn.send(mav.mission_request_int_encode(tsys, tcomp, seq, mission_type))
                        item = await sub.get(self.item_timeout)
                        if item is not None:
                            break
                if item is None:
                    self.conn.send(mav.mission_ack_encode(tsys, tcomp, mavlink.MAV_MISSION_OPERATION_CANCELLED, mission_type))
                    return MissionResult(False, "TIMEOUT", count, items)
                items.append(item_to_dict(item))
        except asyncio.CancelledError:
            self.conn.send(mav.mission_ack_encode(tsys, tcomp, mavlink.MAV_MISSION_OPERATION_CANCELLED, mission_type))
            raise
        self.conn.send(mav.mission_ack_encode(tsys, tcomp, mavlink.MAV_MISSION_ACCEPTED, mission_type))
        return MissionResult(True, "MAV_MISSION_ACCEPTED", count, items)

    async def clear(self, mission_type: int = MISSION, *, target=None) -> MissionResult:
        tsys, tcomp = self.conn.target_ids(target)
        mav = self.conn.mav
        with self.conn.subscribe("MISSION_ACK", self._from_vehicle(tsys, mission_type)) as sub:
            for _ in range(self.retries + 1):
                self.conn.send(mav.mission_clear_all_encode(tsys, tcomp, mission_type))
                ack = await sub.get(self.item_timeout)
                if ack is not None:
                    ok = ack.type == mavlink.MAV_MISSION_ACCEPTED
                    return MissionResult(ok, MISSION_RESULT_NAMES.get(ack.type, str(ack.type)))
        return MissionResult(False, "TIMEOUT")


def item_to_dict(item) -> dict:
    is_int = item.get_type() == "MISSION_ITEM_INT"
    lat, lon = decode_xy(item.frame, item.x, item.y, is_int)
    return {
        "seq": item.seq,
        "cur": item.current,
        "frame": item.frame,
        "cmd": item.command,
        "p1": float(item.param1),
        "p2": float(item.param2),
        "p3": float(item.param3),
        "p4": float(item.param4),
        "lat": lat,
        "lon": lon,
        "alt": float(item.z),
        "ac": item.autocontinue,
    }


def mission_type_of(value) -> int:
    """Accepts 0/1/2 or 'mission'/'fence'/'rally'."""
    if isinstance(value, str):
        for k, v in MISSION_TYPES.items():
            if v == value:
                return k
        raise ValueError(f"unknown mission type {value!r}")
    if value in MISSION_TYPES:
        return int(value)
    raise ValueError(f"unknown mission type {value!r}")


Optional  # re-exported for type hints in callers
