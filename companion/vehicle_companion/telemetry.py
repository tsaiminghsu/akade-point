"""Builds a VehicleState dict from the flight controller's latest messages, and
runs the 1 Hz publish loop (HTTPS POST). The POST response carries any pending
commands, which are pushed onto the shared command queue."""

from __future__ import annotations

import threading
import time
from typing import Callable

MAV_STATE_NAMES = {
    0: "UNINIT",
    1: "BOOT",
    2: "CALIBRATING",
    3: "STANDBY",
    4: "ACTIVE",
    5: "CRITICAL",
    6: "EMERGENCY",
    7: "POWEROFF",
    8: "FLIGHT_TERMINATION",
}


def build_state(link, now_ms: int) -> dict:
    """Assembles a compact VehicleState. Missing messages default to zeros so a
    just-booted FC still produces a valid frame."""
    hb = link.latest("HEARTBEAT")
    sys_status = link.latest("SYS_STATUS")
    battery = link.latest("BATTERY_STATUS")
    gps = link.latest("GPS_RAW_INT")
    pos = link.latest("GLOBAL_POSITION_INT")
    vfr = link.latest("VFR_HUD")
    mission_cur = link.latest("MISSION_CURRENT")
    version = link.latest("AUTOPILOT_VERSION")

    armed = False
    mode = ""
    if hb is not None:
        # base_mode bit 7 (128) = MAV_MODE_FLAG_SAFETY_ARMED
        armed = bool(getattr(hb, "base_mode", 0) & 128)
        mode = getattr(link, "flightmode_of", lambda h: "")(hb) or _mode_name(link)

    sys_state = MAV_STATE_NAMES.get(getattr(hb, "system_status", 3), "STANDBY") if hb else "STANDBY"

    bat_pct = float(getattr(sys_status, "battery_remaining", -1)) if sys_status else -1.0
    bat_v = (getattr(sys_status, "voltage_battery", 0) or 0) / 1000.0 if sys_status else 0.0
    bat_a = (getattr(sys_status, "current_battery", 0) or 0) / 100.0 if sys_status else 0.0
    if battery is not None:
        remaining = getattr(battery, "battery_remaining", -1)
        if remaining is not None and remaining >= 0:
            bat_pct = float(remaining)

    fix = getattr(gps, "fix_type", 0) if gps else 0
    sats = getattr(gps, "satellites_visible", 0) if gps else 0
    hdop = (getattr(gps, "eph", 9999) or 9999) / 100.0 if gps else 99.9

    lat = (getattr(pos, "lat", 0) or 0) / 1e7 if pos else 0.0
    lon = (getattr(pos, "lon", 0) or 0) / 1e7 if pos else 0.0
    alt = (getattr(pos, "alt", 0) or 0) / 1000.0 if pos else 0.0
    rel = (getattr(pos, "relative_alt", 0) or 0) / 1000.0 if pos else 0.0
    hdg = (getattr(pos, "hdg", 0) or 0) / 100.0 if pos else (getattr(vfr, "heading", 0) if vfr else 0.0)

    gs = getattr(vfr, "groundspeed", 0.0) if vfr else 0.0
    vs = getattr(vfr, "climb", 0.0) if vfr else 0.0

    wp_cur = getattr(mission_cur, "seq", 0) if mission_cur else 0
    wp_total = getattr(mission_cur, "total", 0) if mission_cur else 0

    fw = _firmware_string(version)

    return {
        "v": 1,
        "t": now_ms,
        "armed": armed,
        "mode": mode or "UNKNOWN",
        "sys": sys_state,
        "bat": {"pct": round(max(bat_pct, 0.0), 1), "v": round(bat_v, 2), "a": round(bat_a, 2)},
        "gps": {"fix": int(fix), "sats": int(sats), "hdop": round(hdop, 2)},
        "pos": {"lat": round(lat, 7), "lon": round(lon, 7), "alt": round(alt, 2), "rel": round(rel, 2)},
        "hdg": round(hdg, 1),
        "gs": round(gs, 2),
        "vs": round(vs, 2),
        "wp": {"cur": int(wp_cur), "n": int(wp_total)},
        "fw": fw,
    }


def _mode_name(link) -> str:
    try:
        return link.master.flightmode
    except Exception:
        return ""


def _firmware_string(version_msg) -> str:
    if version_msg is None:
        return "unknown"
    v = getattr(version_msg, "flight_sw_version", 0)
    if not v:
        return "unknown"
    major = (v >> 24) & 0xFF
    minor = (v >> 16) & 0xFF
    patch = (v >> 8) & 0xFF
    return f"V{major}.{minor}.{patch}"


class TelemetryPublisher(threading.Thread):
    def __init__(self, link, api, config, enqueue_command: Callable[[dict], None]):
        super().__init__(daemon=True)
        self.link = link
        self.api = api
        self.config = config
        self.enqueue_command = enqueue_command
        self._running = False
        self._last_history_at = 0.0
        self._history: list[dict] = []

    def run(self) -> None:
        self._running = True
        while self._running:
            start = time.time()
            try:
                self._tick(start)
            except Exception as exc:  # keep the loop alive on transient errors
                print(f"[telemetry] {exc}")
            elapsed = time.time() - start
            time.sleep(max(0.0, self.config.telemetry_interval_s - elapsed))

    def stop(self) -> None:
        self._running = False

    def _tick(self, now: float) -> None:
        state = build_state(self.link, int(now * 1000))
        history = None
        if now - self._last_history_at >= self.config.history_every_s:
            self._history.append(state)
            self._last_history_at = now
            if len(self._history) >= 1:
                history = self._history[-60:]
                self._history = []
        resp = self.api.post_telemetry(state, history)
        for cmd in (resp or {}).get("commands", []):
            self.enqueue_command(cmd)
