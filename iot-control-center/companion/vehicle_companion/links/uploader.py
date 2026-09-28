"""Photos and logs to the cloud (device API /api/device/vehicles/files).

For each file: announce it (kind, name, size, SHA-256, time, the photo's
geotag), PUT the bytes where the server says (a presigned S3 URL, or the
app's own route with local storage), then confirm. The server's file id is
derived from the content, so re-announcing after a crash lands on the same
record and the server answers `already`.

What goes up, in order: photos (small, wanted soon), then DataFlash logs the
operator downloaded, then telemetry logs of flights. Logs wait until the
vehicle is disarmed unless `logs_while_armed`; the tlog being written is never
sent. Nothing is attempted while the cloud link is down, and `max_kbps`
caps the uplink so video and telemetry keep their share on 4G.

`state_file` remembers what is done (and what the server refused for good),
so a restart does not upload everything again.
"""

from __future__ import annotations

import asyncio
import calendar
import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional

import aiohttp

log = logging.getLogger(__name__)

KIND_ORDER = {"photo": 0, "dataflash": 1, "tlog": 2}
CHUNK = 64 * 1024
DF_TIME_RE = re.compile(r"^\d+-(\d{8}T\d{6}Z)\.bin$")


@dataclass
class Candidate:
    kind: str  # photo | tlog | dataflash
    name: str
    path: Path
    t: int  # ms, server clock
    geo: Optional[dict] = None

    @property
    def key(self) -> str:
        return f"{self.kind}/{self.name}"


class UploadError(Exception):
    def __init__(self, code: str, retry_s: float):
        super().__init__(code)
        self.code = code
        self.retry_s = retry_s


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


# ---- sources ---------------------------------------------------------------------------------


def photo_candidates(camera) -> list[Candidate]:
    out = []
    for p in camera.photos:
        path = camera.dir / p.name
        geo = None if p.lat is None or p.lon is None else {"lat": p.lat, "lon": p.lon, "alt": p.alt, "rel": p.rel, "hdg": p.hdg}
        out.append(Candidate("photo", p.name, path, int(p.t), geo))
    return out


def tlog_candidates(tlog, server_offset_ms: Callable[[], int], mode: str) -> list[Candidate]:
    """Closed tlogs; with mode "flights" only the files of armed periods."""
    out = []
    for f in tlog.list_files():
        if f["active"] or f["bytes"] == 0:
            continue
        if mode == "flights" and not ("-flight" in f["name"] or "-cont" in f["name"]):
            continue
        out.append(Candidate("tlog", f["name"], tlog.dir / f["name"], f["mtime"] + server_offset_ms()))
    return out


def dataflash_candidates(dataflash, server_offset_ms: Callable[[], int]) -> list[Candidate]:
    out = []
    for f in dataflash.list_files():
        m = DF_TIME_RE.match(f["name"])
        # The log's own UTC start when the autopilot had GPS time; else when it was copied.
        t = calendar.timegm(time.strptime(m.group(1), "%Y%m%dT%H%M%SZ")) * 1000 if m else f["mtime"] + server_offset_ms()
        out.append(Candidate("dataflash", f["name"], dataflash.dir / f["name"], t))
    return out


# ---- the uploader ----------------------------------------------------------------------------


class Uploader:
    def __init__(
        self,
        api_base: str,
        token: str,
        *,
        state_file: str | Path,
        sources: Iterable[Callable[[], list[Candidate]]],
        online: Callable[[], bool],
        armed: Callable[[], bool],
        logs_while_armed: bool = False,
        max_kbps: float = 0.0,
        idle_s: float = 5.0,
    ):
        self.base = api_base.rstrip("/")
        self.token = token
        self.state_path = Path(state_file)
        self.sources = list(sources)
        self.online = online
        self.armed = armed
        self.logs_while_armed = logs_while_armed
        self.max_bps = max_kbps * 1000 / 8 if max_kbps > 0 else 0.0
        self.idle_s = idle_s
        self.done: dict[str, str] = {}
        self.rejected: dict[str, str] = {}
        self._retry_at: dict[str, float] = {}
        self._paused_until = 0.0
        self.error: Optional[str] = None
        self.current: Optional[dict] = None
        self.sent = 0
        self.pending: list[Candidate] = []
        self.session: Optional[aiohttp.ClientSession] = None
        self._wake = asyncio.Event()
        self._load()

    # ---- persistent state ----------------------------------------------------------------------

    def _load(self) -> None:
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
            self.done = dict(data.get("done") or {})
            self.rejected = dict(data.get("rejected") or {})
        except FileNotFoundError:
            pass
        except (ValueError, OSError) as exc:
            log.warning("upload state %s unreadable (%s); starting over", self.state_path, exc)

    def _save(self) -> None:
        tmp = self.state_path.with_suffix(self.state_path.suffix + ".tmp")
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps({"done": self.done, "rejected": self.rejected}), encoding="utf-8")
        os.replace(tmp, self.state_path)

    # ---- queue ---------------------------------------------------------------------------------

    def poke(self) -> None:
        """Look for new files now (e.g. right after a photo)."""
        self._wake.set()

    def queue(self) -> list[Candidate]:
        now = time.monotonic()
        armed = self.armed()
        out = []
        for source in self.sources:
            try:
                items = source()
            except Exception:
                log.exception("upload source failed")
                continue
            for c in items:
                if c.key in self.done or c.key in self.rejected or self._retry_at.get(c.key, 0) > now:
                    continue
                if armed and c.kind != "photo" and not self.logs_while_armed:
                    continue
                if not c.path.is_file():
                    continue
                out.append(c)
        out.sort(key=lambda c: (KIND_ORDER[c.kind], c.t))
        return out

    # ---- loop ----------------------------------------------------------------------------------

    async def start(self) -> None:
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, connect=15, sock_read=60))

    async def close(self) -> None:
        if self.session is not None:
            await self.session.close()

    async def run(self) -> None:
        while True:
            self.pending = self.queue() if self.online() and time.monotonic() >= self._paused_until else []
            if not self.pending:
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), self.idle_s)
                except asyncio.TimeoutError:
                    pass
                continue
            c = self.pending[0]
            try:
                await self.upload(c)
                self.error = None
            except UploadError as exc:
                self.error = exc.code
                if exc.code == "NO_STORAGE":
                    self._paused_until = time.monotonic() + exc.retry_s
                else:
                    self._retry_at[c.key] = time.monotonic() + exc.retry_s
            except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as exc:
                self.error = type(exc).__name__
                self._retry_at[c.key] = time.monotonic() + 30
                log.warning("upload %s failed: %s", c.key, exc)
            finally:
                self.current = None

    async def upload(self, c: Candidate) -> str:
        """One file, start to finish. Returns the server's file id."""
        assert self.session is not None, "Uploader.start() not called"
        size = c.path.stat().st_size
        sha = await asyncio.to_thread(sha256_file, c.path)
        if c.path.stat().st_size != size:
            raise UploadError("CHANGING", 10)  # still being written

        body = {"kind": c.kind, "name": c.name, "bytes": size, "sha256": sha, "t": c.t}
        if c.geo:
            body["geo"] = c.geo
        status, resp = await self._api("POST", "/api/device/vehicles/files", body)
        if status == 503:
            raise UploadError("NO_STORAGE", 600)
        if status == 400:
            # The server will never take it (name, size limit): stop offering it.
            self.rejected[c.key] = json.dumps(resp)[:200] if resp else "400"
            self._save()
            raise UploadError("REJECTED", 0)
        if status != 200 or not resp:
            raise UploadError(f"ANNOUNCE_{status}", 60)
        file_id = resp["fileId"]
        if not resp.get("already"):
            await self._put(c, size, resp["upload"])
            status, done = await self._api("POST", f"/api/device/vehicles/files/{file_id}/complete", {})
            if status != 200:
                raise UploadError(f"COMPLETE_{status}", 60)
        self.done[c.key] = file_id
        self.sent += 1
        self._save()
        log.info("uploaded %s (%d bytes) as %s", c.key, size, file_id)
        return file_id

    async def _put(self, c: Candidate, size: int, target: dict) -> None:
        url = target["url"]
        if url.startswith("/"):
            url = self.base + url
        headers = dict(target.get("headers") or {})
        headers["Content-Length"] = str(size)
        if target.get("auth"):
            headers["Authorization"] = f"Bearer {self.token}"
        self.current = {"kind": c.kind, "name": c.name, "bytes": size, "sent": 0}

        async def body():
            started = time.monotonic()
            sent = 0
            with open(c.path, "rb") as fh:
                while True:
                    block = fh.read(CHUNK)
                    if not block:
                        break
                    yield block
                    sent += len(block)
                    if self.current is not None:
                        self.current["sent"] = sent
                    if self.max_bps:
                        ahead = sent / self.max_bps - (time.monotonic() - started)
                        if ahead > 0:
                            await asyncio.sleep(ahead)

        async with self.session.request(target.get("method", "PUT"), url, data=body(), headers=headers) as r:
            if r.status not in (200, 201, 204):
                text = (await r.text())[:200]
                log.warning("PUT %s -> %s %s", c.key, r.status, text)
                # 403 from S3 is usually an expired URL: announce again for a fresh one.
                raise UploadError(f"PUT_{r.status}", 30)

    async def _api(self, method: str, path: str, body: dict) -> tuple[int, Optional[dict]]:
        assert self.session is not None
        async with self.session.request(
            method, self.base + path, json=body, headers={"Authorization": f"Bearer {self.token}"}, timeout=aiohttp.ClientTimeout(total=30)
        ) as r:
            try:
                data = await r.json(content_type=None)
            except (ValueError, aiohttp.ContentTypeError):
                data = None
            return r.status, data if isinstance(data, dict) else None

    # ---- state ---------------------------------------------------------------------------------

    def state_block(self) -> dict:
        cur = self.current
        return {
            "queue": len(self.pending),
            "queueBytes": sum(c.path.stat().st_size for c in self.pending if c.path.is_file()),
            "cur": None if cur is None else {"kind": cur["kind"], "name": cur["name"], "pct": round(100 * cur["sent"] / cur["bytes"], 1) if cur["bytes"] else 100.0},
            "sent": self.sent,
            "error": self.error,
            "paused": time.monotonic() < self._paused_until,
        }
