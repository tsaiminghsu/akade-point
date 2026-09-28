"""DataFlash (.bin) logs from the autopilot over MAVLink: LOG_REQUEST_LIST,
LOG_REQUEST_DATA, LOG_REQUEST_END.

ArduPilot answers LOG_REQUEST_DATA by streaming LOG_DATA (90 bytes each) for
the requested range. Packets get lost on real links, so the download asks for
windows, keeps a map of what has arrived and re-requests the holes, the way
Mission Planner does. ArduPilot stops logging while a transfer runs and only
serves logs while disarmed; callers check that.

Files are written to `<dir>/<id>-<UTC time>.bin` next to a `.part` while
downloading, so a listing never shows half a log.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from .connection import MavConnection

CHUNK = 90
# Bytes asked for per LOG_REQUEST_DATA; ArduPilot streams the whole window.
WINDOW = 90 * 1024
# Give up after this many requests in a row bring nothing back (the request
# itself can be lost, so one silent window is not fatal).
MAX_STALLS = 5
NAME_RE = re.compile(r"^\d{1,5}-[0-9TZ-]+\.bin$")


class LogError(Exception):
    def __init__(self, code: str, msg: str = ""):
        super().__init__(msg or code)
        self.code = code
        self.msg = msg


@dataclass
class Progress:
    id: int
    size: int
    got: int = 0
    started: float = field(default_factory=time.monotonic)
    done: bool = False
    error: Optional[str] = None

    def block(self) -> dict:
        elapsed = max(0.001, time.monotonic() - self.started)
        return {
            "id": self.id,
            "size": self.size,
            "got": self.got,
            "pct": round(100.0 * self.got / self.size, 1) if self.size else 100.0,
            "bps": round(self.got / elapsed),
            "done": self.done,
            "error": self.error,
        }


def file_name(log_id: int, time_utc: int) -> str:
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(time_utc)) if time_utc > 0 else "notime"
    return f"{log_id:03d}-{stamp}.bin"


class DataflashClient:
    def __init__(self, conn: MavConnection, directory: str | Path, *, idle_timeout: float = 3.0, list_timeout: float = 5.0):
        self.conn = conn
        self.dir = Path(directory)
        self.idle_timeout = idle_timeout
        self.list_timeout = list_timeout
        self.progress: Optional[Progress] = None
        self._cancel = False

    # ---- listing ---------------------------------------------------------

    async def list(self) -> list[dict]:
        sysid, compid = self.conn.target_ids()
        entries: dict[int, dict] = {}
        total: Optional[int] = None
        with self.conn.subscribe("LOG_ENTRY", lambda m: m.get_srcSystem() == sysid) as sub:
            self.conn.send(self.conn.mav.log_request_list_encode(sysid, compid, 0, 0xFFFF))
            deadline = time.monotonic() + self.list_timeout
            while total is None or len(entries) < total:
                left = deadline - time.monotonic()
                if left <= 0:
                    break
                msg = await sub.get(min(left, 1.0))
                if msg is None:
                    continue
                total = int(msg.num_logs)
                if total == 0:
                    break
                entries[int(msg.id)] = {"id": int(msg.id), "size": int(msg.size), "utc": int(msg.time_utc)}
                deadline = time.monotonic() + self.list_timeout  # keep going while entries arrive
        if total is None:
            raise LogError("NO_RESPONSE", "no LOG_ENTRY from the autopilot")
        out = sorted(entries.values(), key=lambda e: e["id"])
        for e in out:
            e["name"] = file_name(e["id"], e["utc"])
            e["onPi"] = (self.dir / e["name"]).is_file()
        return out

    # ---- download ----------------------------------------------------------

    def cancel(self) -> None:
        self._cancel = True

    async def download(self, log_id: int, size: int, time_utc: int = 0, on_progress: Optional[Callable[[Progress], None]] = None) -> Path:
        if size <= 0:
            raise LogError("EMPTY", "log is empty")
        sysid, compid = self.conn.target_ids()
        self.dir.mkdir(parents=True, exist_ok=True)
        final = self.dir / file_name(log_id, time_utc)
        part = final.with_suffix(".bin.part")
        prog = self.progress = Progress(log_id, size)
        self._cancel = False
        n_chunks = (size + CHUNK - 1) // CHUNK
        have = bytearray(n_chunks)  # 1 = chunk received
        missing = n_chunks
        stalls = 0
        try:
            with open(part, "wb") as fh, self.conn.subscribe(
                "LOG_DATA", lambda m: m.get_srcSystem() == sysid and int(m.id) == log_id
            ) as sub:
                fh.truncate(size)
                while missing:
                    if self._cancel:
                        raise LogError("CANCELLED", "download cancelled")
                    start = have.index(0)
                    ofs = start * CHUNK
                    count = min(WINDOW, size - ofs)
                    self.conn.send(self.conn.mav.log_request_data_encode(sysid, compid, log_id, ofs, count))
                    end_chunk = min(n_chunks, (ofs + count + CHUNK - 1) // CHUNK)
                    window_missing = end_chunk - start - sum(have[start:end_chunk])
                    idle_until = time.monotonic() + self.idle_timeout
                    progressed = False
                    while True:
                        if self._cancel:
                            raise LogError("CANCELLED", "download cancelled")
                        msg = await sub.get(0.5)
                        if msg is None:
                            if time.monotonic() > idle_until:
                                break  # re-request from the first hole
                            continue
                        idle_until = time.monotonic() + self.idle_timeout
                        n = int(msg.count)
                        if n == 0:
                            break
                        i = int(msg.ofs) // CHUNK
                        if i >= n_chunks or have[i]:
                            continue
                        fh.seek(int(msg.ofs))
                        fh.write(bytes(msg.data[:n]))
                        have[i] = 1
                        missing -= 1
                        if start <= i < end_chunk:
                            window_missing -= 1
                        progressed = True
                        prog.got = min(size, prog.got + n)
                        if on_progress is not None:
                            on_progress(prog)
                        if window_missing == 0:
                            break  # this window is complete
                    stalls = 0 if progressed else stalls + 1
                    if stalls >= MAX_STALLS:
                        raise LogError("TIMEOUT", f"no LOG_DATA at offset {ofs}")
            os.replace(part, final)
            prog.done = True
            return final
        except LogError as exc:
            prog.error = exc.code
            part.unlink(missing_ok=True)
            raise
        finally:
            self.conn.send(self.conn.mav.log_request_end_encode(sysid, compid))

    # ---- files on the companion ---------------------------------------------

    def list_files(self) -> list[dict]:
        if not self.dir.is_dir():
            return []
        out = []
        for p in sorted(self.dir.glob("*.bin"), key=lambda p: p.name, reverse=True):
            st = p.stat()
            out.append({"name": p.name, "bytes": st.st_size, "mtime": int(st.st_mtime * 1000)})
        return out

    def resolve(self, name: str) -> Optional[Path]:
        if os.path.basename(name) != name or not NAME_RE.match(name):
            return None
        p = self.dir / name
        return p if p.is_file() else None

    def state_block(self) -> Optional[dict]:
        return None if self.progress is None else self.progress.block()
