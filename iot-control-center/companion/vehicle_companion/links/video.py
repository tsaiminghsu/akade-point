"""MediaMTX on the Pi serves the camera (WebRTC/WHEP for the browser, RTSP for
Mission Planner and QGC). The companion only talks to MediaMTX's control API:
it reports whether the stream is up and switches recording on and off.

API: https://mediamtx.org/docs/usage/control-api (v3).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import aiohttp

log = logging.getLogger(__name__)


class VideoControl:
    def __init__(self, api_url: str, path: str, *, poll_s: float = 5.0):
        self.api = api_url.rstrip("/")
        self.path = path
        self.poll_s = poll_s
        self.status: Optional[dict] = None
        self._session: Optional[aiohttp.ClientSession] = None

    async def start(self) -> None:
        self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4))

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()

    async def refresh(self) -> Optional[dict]:
        assert self._session is not None
        try:
            async with self._session.get(f"{self.api}/v3/paths/get/{self.path}") as r:
                if r.status == 404:
                    self.status = {"ready": False, "readers": 0, "recording": None, "at": time.time()}
                    return self.status
                data = await r.json()
            async with self._session.get(f"{self.api}/v3/config/paths/get/{self.path}") as r:
                conf = await r.json() if r.status == 200 else {}
            self.status = {
                "ready": bool(data.get("ready")),
                "readers": len(data.get("readers") or []),
                "recording": bool(conf.get("record")) if conf else None,
                "at": time.time(),
            }
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            log.debug("mediamtx unreachable: %s", exc)
            self.status = None
        return self.status

    async def set_recording(self, on: bool) -> tuple[bool, str]:
        assert self._session is not None
        try:
            async with self._session.patch(f"{self.api}/v3/config/paths/patch/{self.path}", json={"record": bool(on)}) as r:
                if r.status in (200, 204):
                    await self.refresh()
                    return True, "OK"
                return False, f"MEDIAMTX_{r.status}"
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            return False, f"MEDIAMTX_UNREACHABLE:{type(exc).__name__}"

    def state_block(self) -> Optional[dict]:
        """For the vehicle state: None when MediaMTX is not configured or silent."""
        s = self.status
        if s is None or time.time() - s["at"] > self.poll_s * 3:
            return None
        return {"ready": s["ready"], "readers": s["readers"], "rec": s["recording"]}

    async def run(self) -> None:
        while True:
            await self.refresh()
            await asyncio.sleep(self.poll_s)
