"""SRTM elevation tiles (.hgt, optionally zipped) as ArduPilot's terrain
server publishes them (https://terrain.ardupilot.org/SRTM1/N24E120.hgt.zip).

A tile covers one degree: 3601x3601 (SRTM1, ~30 m) or 1201x1201 (SRTM3,
~90 m) big-endian int16 metres, first row at the north edge, first column
at the west edge, edges shared with the neighbours. -32768 marks a void.
"""

from __future__ import annotations

import array
import math
import sys
import zipfile
from collections import OrderedDict
from pathlib import Path
from typing import Optional

VOID = -32768


def tile_name(lat: float, lon: float) -> str:
    la, lo = math.floor(lat), math.floor(lon)
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


class Tile:
    def __init__(self, data: bytes, lat0: int, lon0: int):
        n = int(round(math.sqrt(len(data) // 2)))
        if n * n * 2 != len(data) or n not in (1201, 3601):
            raise ValueError(f"not an SRTM tile ({len(data)} bytes)")
        self.n = n
        self.lat0 = lat0  # south edge
        self.lon0 = lon0  # west edge
        heights = array.array("h")
        heights.frombytes(data)
        if sys.byteorder == "little":
            heights.byteswap()
        self.h = heights

    def _at(self, row: int, col: int) -> Optional[int]:
        v = self.h[row * self.n + col]
        return None if v == VOID else v

    def height(self, lat: float, lon: float) -> Optional[float]:
        """Bilinear between the four surrounding posts; None on voids."""
        span = self.n - 1
        y = (self.lat0 + 1 - lat) * span  # rows count down from the north edge
        x = (lon - self.lon0) * span
        if not (0 <= y <= span and 0 <= x <= span):
            return None
        r0, c0 = min(int(y), span - 1), min(int(x), span - 1)
        fy, fx = y - r0, x - c0
        q = [self._at(r0, c0), self._at(r0, c0 + 1), self._at(r0 + 1, c0), self._at(r0 + 1, c0 + 1)]
        if any(v is None for v in q):
            return None
        top = q[0] + (q[1] - q[0]) * fx
        bottom = q[2] + (q[3] - q[2]) * fx
        return top + (bottom - top) * fy


class SrtmStore:
    """Tiles from a directory, a few kept in memory (an SRTM1 tile is 26 MB)."""

    def __init__(self, directory: str | Path, *, keep: int = 4):
        self.dir = Path(directory)
        self.keep = keep
        self._tiles: OrderedDict[str, Optional[Tile]] = OrderedDict()

    def path_for(self, name: str) -> Optional[Path]:
        for p in (self.dir / f"{name}.hgt", self.dir / f"{name}.hgt.zip"):
            if p.is_file():
                return p
        return None

    def forget(self, name: str) -> None:
        self._tiles.pop(name, None)

    def tile(self, name: str) -> Optional[Tile]:
        if name in self._tiles:
            self._tiles.move_to_end(name)
            return self._tiles[name]
        path = self.path_for(name)
        tile = None
        if path is not None:
            if path.suffix == ".zip":
                with zipfile.ZipFile(path) as z:
                    data = z.read(next(n for n in z.namelist() if n.lower().endswith(".hgt")))
            else:
                data = path.read_bytes()
            lat0 = int(name[1:3]) * (1 if name[0] == "N" else -1)
            lon0 = int(name[4:7]) * (1 if name[3] == "E" else -1)
            tile = Tile(data, lat0, lon0)
        self._tiles[name] = tile
        while len(self._tiles) > self.keep:
            self._tiles.popitem(last=False)
        return tile

    def height(self, lat: float, lon: float) -> Optional[float]:
        tile = self.tile(tile_name(lat, lon))
        return None if tile is None else tile.height(lat, lon)
