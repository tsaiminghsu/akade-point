"""Companion computer health for the status bar: CPU temperature, load, disk,
and the Raspberry Pi firmware's throttling flags. Under-voltage is the classic
Pi-on-a-drone failure (a sagging 5 V BEC), and `vcgencmd get_throttled` is the
only place it shows up. Anything unavailable (not a Pi, not Linux) is None."""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional

THROTTLE_BITS = {
    0: "under_voltage",
    1: "freq_capped",
    2: "throttled",
    3: "soft_temp_limit",
    16: "under_voltage_seen",
    17: "freq_capped_seen",
    18: "throttled_seen",
    19: "soft_temp_limit_seen",
}


def decode_throttled(value: int) -> list[str]:
    return [name for bit, name in THROTTLE_BITS.items() if value & (1 << bit)]


def _read_temp_c() -> Optional[float]:
    p = Path("/sys/class/thermal/thermal_zone0/temp")
    try:
        return round(int(p.read_text().strip()) / 1000.0, 1)
    except (OSError, ValueError):
        return None


def _read_throttled() -> Optional[int]:
    if not shutil.which("vcgencmd"):
        return None
    try:
        out = subprocess.run(["vcgencmd", "get_throttled"], capture_output=True, text=True, timeout=2).stdout
        return int(out.strip().split("=")[1], 16)
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return None


class SysInfo:
    def __init__(self, disk_path: str = "/", interval_s: float = 10.0):
        self.disk_path = disk_path if os.path.exists(disk_path) else os.getcwd()
        self.interval_s = interval_s
        self._started = time.monotonic()
        self.snapshot: dict = {}
        self.sample()

    def sample(self) -> dict:
        load = None
        if hasattr(os, "getloadavg"):
            try:
                load = round(os.getloadavg()[0], 2)
            except OSError:
                pass
        disk_free = None
        try:
            disk_free = shutil.disk_usage(self.disk_path).free // (1024 * 1024)
        except OSError:
            pass
        throttled = _read_throttled()
        self.snapshot = {
            "tempC": _read_temp_c(),
            "load": load,
            "cpus": os.cpu_count(),
            "diskFreeMb": disk_free,
            "throttled": decode_throttled(throttled) if throttled is not None else None,
            "uptimeS": int(time.monotonic() - self._started),
        }
        return self.snapshot

    async def run(self) -> None:
        while True:
            await asyncio.sleep(self.interval_s)
            await asyncio.to_thread(self.sample)
