"""Terrain for the autopilot: answers ArduPilot's TERRAIN_REQUEST with
TERRAIN_DATA from SRTM tiles on the companion, as Mission Planner does when
it is connected. With it, missions in terrain frame and terrain following
work without a terrain cache on the autopilot's SD card.

Protocol (AP_Terrain): a request names a grid's south-west corner, the post
spacing and a 56-bit mask; bit b stands for the 4x4 block starting
(b // 8) * 4 posts north and (b % 8) * 4 posts east of the corner. Each block
is answered with one TERRAIN_DATA whose data[i * 4 + j] is the height i posts
further north and j posts further east.

Missing tiles can be fetched from ArduPilot's terrain server when the Pi is
online (download = true); otherwise put .hgt / .hgt.zip files in the
directory yourself.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from pathlib import Path
from typing import Optional

from ..mav.connection import MavConnection
from .srtm import SrtmStore, tile_name

log = logging.getLogger(__name__)

EARTH_R = 6_378_100.0  # AP's RADIUS_OF_EARTH, for Location::offset
BLOCK = 4
BLOCKS_EAST = 8
BLOCKS = 56
DEFAULT_SERVER = "https://terrain.ardupilot.org/SRTM1"


def offset(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    """ArduPilot's flat-earth Location::offset."""
    dlat = north_m / EARTH_R
    dlon = east_m / (EARTH_R * math.cos(math.radians(lat)))
    return lat + math.degrees(dlat), lon + math.degrees(dlon)


def block_heights(store: SrtmStore, lat: float, lon: float, spacing: int, bit: int) -> Optional[list[int]]:
    """The 16 heights of block `bit`, or None if any post has no data."""
    north0 = (bit // BLOCKS_EAST) * BLOCK
    east0 = (bit % BLOCKS_EAST) * BLOCK
    out: list[int] = []
    for i in range(BLOCK):
        for j in range(BLOCK):
            p_lat, p_lon = offset(lat, lon, (north0 + i) * spacing, (east0 + j) * spacing)
            h = store.height(p_lat, p_lon)
            if h is None:
                return None
            out.append(int(round(h)))
    return out


class TerrainServer:
    def __init__(self, conn: MavConnection, directory: str | Path, *, download: bool = False, server: str = DEFAULT_SERVER):
        self.conn = conn
        self.store = SrtmStore(directory)
        self.download = download
        self.server = server.rstrip("/")
        self.served = 0
        self.last_request: Optional[float] = None
        self.missing: set[str] = set()
        self._fetching: set[str] = set()
        self._failed_at: dict[str, float] = {}

    def on_request(self, msg) -> None:
        asyncio.get_running_loop().create_task(self._answer(msg))

    async def _answer(self, msg) -> None:
        self.last_request = time.monotonic()
        lat, lon, spacing, mask = msg.lat / 1e7, msg.lon / 1e7, int(msg.grid_spacing), int(msg.mask)
        for bit in range(BLOCKS):
            if not mask & (1 << bit):
                continue
            heights = block_heights(self.store, lat, lon, spacing, bit)
            if heights is None:
                # Remember which tiles were needed; fetch them if allowed.
                n_lat, n_lon = offset(lat, lon, (bit // BLOCKS_EAST) * BLOCK * spacing, (bit % BLOCKS_EAST) * BLOCK * spacing)
                await self._need(tile_name(n_lat, n_lon))
                continue
            self.conn.send(self.conn.mav.terrain_data_encode(msg.lat, msg.lon, spacing, bit, heights))
            self.served += 1
            if self.served % 56 == 0:
                await asyncio.sleep(0)  # let the reader breathe on long bursts

    async def _need(self, name: str) -> None:
        if self.store.path_for(name) is not None:
            return
        self.missing.add(name)
        if not self.download or name in self._fetching or time.monotonic() - self._failed_at.get(name, -1e9) < 600:
            return
        self._fetching.add(name)
        asyncio.get_running_loop().create_task(self._fetch(name))

    async def _fetch(self, name: str) -> None:
        import aiohttp

        url = f"{self.server}/{name}.hgt.zip"
        dest = self.store.dir / f"{name}.hgt.zip"
        try:
            self.store.dir.mkdir(parents=True, exist_ok=True)
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=300)) as http:
                async with http.get(url) as r:
                    if r.status == 404:
                        # Ocean: no tile exists. Stop asking.
                        self._failed_at[name] = 1e18
                        return
                    r.raise_for_status()
                    data = await r.read()
            tmp = dest.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(dest)
            self.store.forget(name)
            self.missing.discard(name)
            log.info("terrain tile %s downloaded (%d bytes)", name, len(data))
        except Exception as exc:
            self._failed_at[name] = time.monotonic()
            log.warning("terrain tile %s: %s", name, exc)
        finally:
            self._fetching.discard(name)

    def state_block(self) -> dict:
        report = self.conn.latest("TERRAIN_REPORT", max_age=5.0)
        return {
            "served": self.served,
            "missing": sorted(self.missing) or None,
            "active": self.last_request is not None and time.monotonic() - self.last_request < 30,
            # The autopilot's own view: blocks still wanted / held, height of the ground below and above it.
            "fc": None
            if report is None
            else {
                "pending": int(report.pending),
                "loaded": int(report.loaded),
                "ground": None if not report.spacing else round(report.terrain_height, 1),
                "above": None if not report.spacing else round(report.current_height, 1),
            },
        }
