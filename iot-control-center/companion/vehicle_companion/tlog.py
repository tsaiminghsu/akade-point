"""Telemetry log (.tlog) recorder, the format Mission Planner and MAVExplorer
read: each packet is prefixed with an 8-byte big-endian microsecond timestamp.

One file per companion start, a new one each time the vehicle arms and
another when it disarms, so a flight is exactly one closed file ("-flight")
as soon as it ends (the uploader sends it then) and time on the ground goes
to "-ground" files. Old files are deleted once the directory exceeds
`max_total_mb`. Writes come from the MAVLink reader thread and the writer, so
they are serialised with a lock; the file is buffered and flushed once a
second."""

from __future__ import annotations

import logging
import os
import struct
import threading
import time
from pathlib import Path
from typing import Optional

from .mav.proto import mavlink

log = logging.getLogger(__name__)


class TlogWriter:
    def __init__(self, directory: str | Path, *, max_file_mb: int = 256, max_total_mb: int = 2048):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.max_file_bytes = max_file_mb * 1024 * 1024
        self.max_total_bytes = max_total_mb * 1024 * 1024
        self._lock = threading.Lock()
        self._fh = None
        self._path: Optional[Path] = None
        self._written = 0
        self._last_flush = 0.0
        self._armed: Optional[bool] = None
        self._open("boot")

    @property
    def path(self) -> Optional[Path]:
        return self._path

    def _open(self, reason: str) -> None:
        if self._fh is not None:
            self._fh.close()
        stamp = time.strftime("%Y%m%d-%H%M%S")
        path = self.dir / f"{stamp}-{reason}.tlog"
        n = 1
        while path.exists():
            n += 1
            path = self.dir / f"{stamp}-{reason}-{n}.tlog"
        self._fh = open(path, "ab", buffering=64 * 1024)
        self._path = path
        self._written = 0
        self._prune()

    def _prune(self) -> None:
        files = sorted(self.dir.glob("*.tlog"), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        for p in files:
            if total <= self.max_total_bytes or p == self._path:
                break
            size = p.stat().st_size
            try:
                p.unlink()
                total -= size
            except OSError:
                pass

    def write(self, packet: bytes) -> None:
        with self._lock:
            if self._fh is None:
                return
            self._fh.write(struct.pack(">Q", int(time.time() * 1_000_000)))
            self._fh.write(packet)
            self._written += 8 + len(packet)
            now = time.monotonic()
            if now - self._last_flush > 1.0:
                self._fh.flush()
                self._last_flush = now
            if self._written > self.max_file_bytes:
                self._open("cont")

    def on_heartbeat(self, hb) -> None:
        """Start a fresh file on each arm and each disarm."""
        armed = bool(hb.base_mode & mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
        with self._lock:
            if self._armed is False and armed:
                self._open("flight")
            elif self._armed is True and not armed:
                self._open("ground")
            self._armed = armed

    def list_files(self) -> list[dict]:
        out = []
        for p in sorted(self.dir.glob("*.tlog"), key=lambda p: p.stat().st_mtime, reverse=True):
            st = p.stat()
            out.append({"name": p.name, "bytes": st.st_size, "mtime": int(st.st_mtime * 1000), "active": p == self._path})
        return out

    def resolve(self, name: str) -> Optional[Path]:
        """Maps a file name from list_files() back to a path, refusing anything
        that is not a plain name inside the directory."""
        if os.path.basename(name) != name or not name.endswith(".tlog"):
            return None
        p = self.dir / name
        return p if p.is_file() else None

    def close(self) -> None:
        with self._lock:
            if self._fh is not None:
                self._fh.close()
                self._fh = None
