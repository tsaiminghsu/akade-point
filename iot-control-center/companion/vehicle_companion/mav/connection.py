"""One MAVLink connection: exactly one reader thread, one writer.

The reader thread is the only code that ever receives. Each message

* updates a latest-value cache keyed by (sysid, compid, type) — high-rate
  telemetry stays here and is read on demand, never queued;
* goes to the tlog;
* if it is a protocol message (acks, mission/param/log handshakes,
  statustext, heartbeats) it is also handed to the asyncio loop, where
  subscriptions consume it.

The previous companion let command code call `recv_match` while the reader
thread did the same, so whichever thread won took the COMMAND_ACK and the other
saw a timeout. Subscriptions replace that: register first, send second, then
await — a fast reply can no longer arrive before anyone is listening.

The vehicle we talk to is pinned explicitly from heartbeats (autopilot set,
not a peripheral, component 1 preferred). pymavlink's own `target_system` is
whatever heartbeat it saw first — through mavlink-router that can be the
gimbal, an ESP32 node or Mission Planner.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Callable, Iterable, Optional

from .proto import mavlink, mavutil
from .vehicle import is_vehicle

log = logging.getLogger(__name__)

EVENT_TYPES = frozenset(
    {
        "HEARTBEAT",
        "COMMAND_ACK",
        "MISSION_COUNT",
        "MISSION_REQUEST",
        "MISSION_REQUEST_INT",
        "MISSION_ITEM",
        "MISSION_ITEM_INT",
        "MISSION_ACK",
        "MISSION_CURRENT",
        "PARAM_VALUE",
        "STATUSTEXT",
        "LOG_ENTRY",
        "LOG_DATA",
        # Several names per component: the per-type cache would keep only the last.
        "NAMED_VALUE_FLOAT",
        # One per aircraft.
        "ADSB_VEHICLE",
    }
)

# A pinned target is replaced only after it has been silent this long.
TARGET_STALE_S = 5.0
# Other GCS heartbeats count as "connected" for this long.
GCS_SEEN_S = 5.0

Predicate = Callable[[object], bool]


class Subscription:
    """Collects matching messages on the loop thread until closed. Use as a
    context manager so it is always unregistered."""

    def __init__(self, conn: "MavConnection", types: frozenset[str], predicate: Optional[Predicate]):
        self._conn = conn
        self.types = types
        self.predicate = predicate
        self.queue: asyncio.Queue = asyncio.Queue()

    def matches(self, msg) -> bool:
        if msg.get_type() not in self.types:
            return False
        if self.predicate is None:
            return True
        try:
            return bool(self.predicate(msg))
        except Exception:  # a predicate bug must not break dispatch
            log.exception("subscription predicate failed")
            return False

    async def get(self, timeout: float):
        """Next matching message, or None after `timeout` seconds."""
        try:
            return await asyncio.wait_for(self.queue.get(), timeout)
        except asyncio.TimeoutError:
            return None

    def close(self) -> None:
        self._conn._unsubscribe(self)

    def __enter__(self) -> "Subscription":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


class MavConnection:
    def __init__(
        self,
        url: str,
        *,
        baud: int = 57600,
        source_system: int = 253,
        source_component: int = mavlink.MAV_COMP_ID_ONBOARD_COMPUTER,
        target_system: Optional[int] = None,
        tlog=None,
    ):
        self.url = url
        self.baud = baud
        self.source_system = source_system
        self.source_component = source_component
        self.configured_target_system = target_system
        self.tlog = tlog

        self.master = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._reader: Optional[threading.Thread] = None
        self._running = False

        self._lock = threading.Lock()
        self._cache: dict[tuple[int, int, str], tuple[object, float]] = {}
        self._heartbeats: dict[tuple[int, int], tuple[object, float]] = {}
        self._gcs_seen: dict[tuple[int, int], float] = {}
        self._target: Optional[tuple[int, int]] = None
        self._target_changed_at = 0.0

        self._send_lock = threading.Lock()
        # Loop-thread only.
        self._subs: list[Subscription] = []
        self._listeners: dict[str, list[Callable[[object], None]]] = {}

        self.rx_count = 0
        self.tx_count = 0

    # ---- lifecycle -----------------------------------------------------

    def open(self) -> None:
        kwargs = dict(source_system=self.source_system, source_component=self.source_component, autoreconnect=True)
        if not self.url.startswith(("udp", "tcp")):
            kwargs["baud"] = self.baud
        self.master = mavutil.mavlink_connection(self.url, **kwargs)

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        if self.master is None:
            self.open()
        self._loop = loop
        self._running = True
        self._reader = threading.Thread(target=self._read_loop, name="mav-reader", daemon=True)
        self._reader.start()

    def stop(self) -> None:
        self._running = False
        if self._reader is not None:
            self._reader.join(timeout=2.0)
        if self.master is not None:
            try:
                self.master.close()
            except Exception:
                pass
        if self.tlog is not None:
            self.tlog.close()

    # ---- reader thread -------------------------------------------------

    def _read_loop(self) -> None:
        while self._running:
            try:
                msg = self.master.recv_match(blocking=True, timeout=0.5)
            except Exception as exc:  # e.g. WinError 10054 on UDP, serial unplug
                log.debug("recv failed: %s", exc)
                time.sleep(0.05)
                continue
            if msg is None:
                continue
            if msg.get_type() == "BAD_DATA":
                continue
            self._on_message(msg, time.monotonic())

    def _on_message(self, msg, rx: float) -> None:
        mtype = msg.get_type()
        src = (msg.get_srcSystem(), msg.get_srcComponent())
        self.rx_count += 1
        # A DataFlash download would copy the whole .bin into the tlog as well.
        if self.tlog is not None and mtype != "LOG_DATA":
            buf = msg.get_msgbuf()
            if buf:
                self.tlog.write(bytes(buf))

        with self._lock:
            self._cache[(src[0], src[1], mtype)] = (msg, rx)
            if mtype == "HEARTBEAT" and src[0] != self.source_system:
                self._heartbeats[src] = (msg, rx)
                if msg.type == mavlink.MAV_TYPE_GCS:
                    self._gcs_seen[src] = rx
                elif is_vehicle(msg):
                    self._consider_target(src, rx)
                if self.tlog is not None and src == self._target:
                    self.tlog.on_heartbeat(msg)

        if mtype in EVENT_TYPES and self._loop is not None:
            try:
                self._loop.call_soon_threadsafe(self._dispatch, msg)
            except RuntimeError:  # loop closed during shutdown
                pass

    def _consider_target(self, src: tuple[int, int], rx: float) -> None:
        """Called with the lock held for every vehicle-like heartbeat."""
        if self.configured_target_system is not None and src[0] != self.configured_target_system:
            return
        cur = self._target
        if cur == src:
            return
        if cur is not None:
            cur_hb = self._heartbeats.get(cur)
            cur_alive = cur_hb is not None and rx - cur_hb[1] < TARGET_STALE_S
            # Same system, prefer the primary autopilot component.
            upgrade = src[0] == cur[0] and src[1] == mavlink.MAV_COMP_ID_AUTOPILOT1 and cur[1] != src[1]
            if cur_alive and not upgrade:
                return
        self._target = src
        self._target_changed_at = rx
        log.info("pinned vehicle sysid=%s compid=%s", *src)

    # ---- loop thread ---------------------------------------------------

    def _dispatch(self, msg) -> None:
        for sub in list(self._subs):
            if sub.matches(msg):
                sub.queue.put_nowait(msg)
        for fn in self._listeners.get(msg.get_type(), ()):
            try:
                fn(msg)
            except Exception:
                log.exception("listener for %s failed", msg.get_type())

    def subscribe(self, types: Iterable[str] | str, predicate: Optional[Predicate] = None) -> Subscription:
        """Registers a subscription immediately. Call before sending the request
        whose reply you want."""
        if isinstance(types, str):
            types = (types,)
        sub = Subscription(self, frozenset(types), predicate)
        self._subs.append(sub)
        return sub

    def _unsubscribe(self, sub: Subscription) -> None:
        try:
            self._subs.remove(sub)
        except ValueError:
            pass

    def add_listener(self, mtype: str, fn: Callable[[object], None]) -> None:
        if mtype not in EVENT_TYPES:
            raise ValueError(f"{mtype} is not dispatched to the loop; read it from the cache")
        self._listeners.setdefault(mtype, []).append(fn)

    # ---- target & cache ------------------------------------------------

    @property
    def target(self) -> Optional[tuple[int, int]]:
        with self._lock:
            return self._target

    async def wait_target(self, timeout: Optional[float] = None) -> Optional[tuple[int, int]]:
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            t = self.target
            if t is not None:
                return t
            if deadline is not None and time.monotonic() >= deadline:
                return None
            await asyncio.sleep(0.1)

    def heartbeat(self, max_age: Optional[float] = TARGET_STALE_S):
        """The pinned vehicle's latest heartbeat, or None if unknown or stale."""
        with self._lock:
            if self._target is None:
                return None
            entry = self._heartbeats.get(self._target)
        if entry is None:
            return None
        msg, rx = entry
        if max_age is not None and time.monotonic() - rx > max_age:
            return None
        return msg

    def latest(self, mtype: str, *, src: Optional[tuple[int, int]] = None, max_age: Optional[float] = None):
        """Latest `mtype` from `src` (default: the pinned vehicle), or None if
        never received or older than `max_age` seconds."""
        with self._lock:
            key_src = src or self._target
            if key_src is None:
                return None
            entry = self._cache.get((key_src[0], key_src[1], mtype))
        if entry is None:
            return None
        msg, rx = entry
        if max_age is not None and time.monotonic() - rx > max_age:
            return None
        return msg

    def latest_any(self, mtype: str, *, max_age: Optional[float] = None):
        """Newest `mtype` from any source, e.g. RADIO_STATUS from a SiK radio or
        DroneBridge. Returns (msg, (sysid, compid)) or None."""
        best = None
        with self._lock:
            for (sysid, compid, t), (msg, rx) in self._cache.items():
                if t == mtype and (best is None or rx > best[1]):
                    best = (msg, rx, (sysid, compid))
        if best is None:
            return None
        if max_age is not None and time.monotonic() - best[1] > max_age:
            return None
        return best[0], best[2]

    def age(self, mtype: str) -> Optional[float]:
        """Seconds since `mtype` last arrived from the pinned vehicle."""
        with self._lock:
            if self._target is None:
                return None
            entry = self._cache.get((self._target[0], self._target[1], mtype))
        return None if entry is None else time.monotonic() - entry[1]

    def components(self, max_age: float = TARGET_STALE_S) -> dict[tuple[int, int], object]:
        """Every component heard recently, keyed by (sysid, compid)."""
        now = time.monotonic()
        with self._lock:
            return {src: hb for src, (hb, rx) in self._heartbeats.items() if now - rx <= max_age}

    def other_gcs(self) -> list[tuple[int, int]]:
        """Ground stations (e.g. Mission Planner) heard in the last few seconds."""
        now = time.monotonic()
        with self._lock:
            return sorted(src for src, rx in self._gcs_seen.items() if now - rx <= GCS_SEEN_S)

    # ---- writer --------------------------------------------------------

    @property
    def mav(self):
        """The encoder; use its *_encode methods and pass the result to send()."""
        return self.master.mav

    def send(self, msg) -> None:
        with self._send_lock:
            self.master.mav.send(msg)
            self.tx_count += 1
            if self.tlog is not None:
                buf = msg.get_msgbuf()
                if buf:
                    self.tlog.write(bytes(buf))

    def target_ids(self, target: Optional[tuple[int, int]] = None) -> tuple[int, int]:
        t = target or self.target
        if t is None:
            raise NoVehicle()
        return t


class NoVehicle(Exception):
    """No flight controller heartbeat has been seen yet."""

    code = "NO_VEHICLE"
