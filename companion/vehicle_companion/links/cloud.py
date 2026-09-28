"""HTTPS link to the Control Center (device API).

* Telemetry: one POST per `telemetry_interval_s` carrying the current state,
  any history points not yet delivered, and (contract v2) new STATUSTEXT
  messages. The response carries pending commands, the server's clock
  (`now`) and whether an operator is watching (`op`).
* Acks: an outbox retried until the server accepts them. A lost ack used to
  leave the command stuck until it timed out on the server.
* Missions: fetched and posted on demand for upload/download commands.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict
from typing import Callable, Optional

import aiohttp

from ..clock import Clock
from ..state import to_v1

log = logging.getLogger(__name__)

HISTORY_MAX_PENDING = 120
HISTORY_MAX_PER_POST = 60
MSGS_MAX_PER_POST = 50
OPERATOR_PRESENT_S = 5.0


class CloudLink:
    def __init__(
        self,
        api_base: str,
        token: str,
        clock: Clock,
        *,
        contract: int = 1,
        telemetry_interval_s: float = 1.0,
        history_every_s: float = 5.0,
        history_armed_s: float = 2.0,
        timeout_s: float = 8.0,
    ):
        self.base = api_base.rstrip("/")
        self.token = token
        self.clock = clock
        self.contract = contract
        self.telemetry_interval_s = telemetry_interval_s
        self.history_every_s = history_every_s
        # Denser while armed, so the ground station's replay of a flight is useful.
        self.history_armed_s = min(history_armed_s, history_every_s)
        self.timeout = aiohttp.ClientTimeout(total=timeout_s)
        self.on_command: Callable[[dict], None] = lambda cmd: None
        self.session: Optional[aiohttp.ClientSession] = None

        self._history: list[dict] = []
        self._last_history = 0.0
        self._acks: OrderedDict[str, dict] = OrderedDict()
        self._ack_event = asyncio.Event()
        self._audit: list[dict] = []
        self._op_seen_at = 0.0
        self.last_ok_at: Optional[float] = None
        self.last_error: Optional[str] = None

    # ---- lifecycle -----------------------------------------------------

    async def start(self) -> None:
        self.session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            timeout=self.timeout,
        )

    async def close(self) -> None:
        if self.session is not None:
            await self.session.close()

    @property
    def operator_present(self) -> bool:
        return time.monotonic() - self._op_seen_at < OPERATOR_PRESENT_S

    @property
    def connected(self) -> bool:
        return self.last_ok_at is not None and time.monotonic() - self.last_ok_at < max(5.0, self.telemetry_interval_s * 4)

    # ---- telemetry -----------------------------------------------------

    def _project(self, state: dict) -> dict:
        return state if self.contract >= 2 else to_v1(state)

    def _maybe_history(self, state: dict) -> None:
        now = time.monotonic()
        every = self.history_armed_s if state.get("armed") else self.history_every_s
        if now - self._last_history < every:
            return
        self._last_history = now
        if state.get("pos") is None:
            return  # a point without a position would draw a line to 0,0
        self._history.append(self._project(state))
        if len(self._history) > HISTORY_MAX_PENDING:
            self._history = self._history[-HISTORY_MAX_PENDING:]

    async def post_telemetry(self, state: dict, status=None) -> Optional[dict]:
        self._maybe_history(state)
        body: dict = {"state": self._project(state)}
        history = self._history[:HISTORY_MAX_PER_POST]
        if history:
            body["history"] = history
        msgs: list[dict] = []
        audit: list[dict] = []
        if self.contract >= 2:
            if status is not None:
                msgs = status.take_outbox()[-MSGS_MAX_PER_POST:]
                if msgs:
                    body["msgs"] = msgs
            audit, self._audit = self._audit[:50], self._audit[50:]
            if audit:
                body["audit"] = audit
        sent_at = Clock.local_ms()
        resp = await self._post("/api/device/vehicles/telemetry", body)
        if resp is None:
            if status is not None and msgs:
                status.requeue(msgs)
            self._audit = audit + self._audit
            return None
        del self._history[: len(history)]
        recv_at = Clock.local_ms()
        if isinstance(resp.get("now"), (int, float)):
            self.clock.update(resp["now"], sent_at, recv_at)
        if resp.get("op"):
            self._op_seen_at = time.monotonic()
        for cmd in resp.get("commands") or []:
            self.on_command(cmd)
        return resp

    async def telemetry_loop(self, build_state: Callable[[], dict], status=None) -> None:
        loop = asyncio.get_running_loop()
        while True:
            started = loop.time()
            try:
                await self.post_telemetry(build_state(), status)
            except Exception:
                log.exception("telemetry tick failed")
            await asyncio.sleep(max(0.05, self.telemetry_interval_s - (loop.time() - started)))

    # ---- acks ----------------------------------------------------------

    def enqueue_ack(self, ack: dict) -> None:
        self._acks[ack["id"]] = ack
        self._ack_event.set()

    def audit(self, entry: dict) -> None:
        """Records a command that arrived over the direct link, for the server's
        command log (contract v2)."""
        self._audit.append(entry)
        if len(self._audit) > 500:
            self._audit = self._audit[-500:]

    async def ack_loop(self) -> None:
        backoff = 1.0
        while True:
            await self._ack_event.wait()
            self._ack_event.clear()
            while self._acks:
                cid, ack = next(iter(self._acks.items()))
                status = await self._post_status(f"/api/device/vehicles/commands/{cid}/ack", ack)
                if status in (200, 400, 404, 409):
                    # Delivered, or the server will never take it (malformed, unknown,
                    # already settled): either way stop retrying.
                    self._acks.pop(cid, None)
                    backoff = 1.0
                    continue
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    # ---- missions ------------------------------------------------------

    async def get_mission(self, mission_id: str) -> Optional[dict]:
        data = await self._get(f"/api/device/vehicles/missions/{mission_id}")
        return None if data is None else data.get("mission")

    async def post_mission_download(self, command_id: str, items: list[dict], mission_type: int = 0) -> bool:
        body: dict = {"commandId": command_id, "items": items}
        if self.contract >= 2:
            body["mtype"] = mission_type
        return await self._post("/api/device/vehicles/missions/download", body) is not None

    async def post_params(self, command_id: str, params: dict, fw: Optional[str]) -> bool:
        body = {"commandId": command_id, "params": params, "fw": fw}
        return await self._post("/api/device/vehicles/params", body) is not None

    # ---- http ----------------------------------------------------------

    async def _post(self, path: str, body: dict) -> Optional[dict]:
        assert self.session is not None, "CloudLink.start() not called"
        try:
            async with self.session.post(self.base + path, json=body) as r:
                if r.status == 200:
                    self.last_ok_at = time.monotonic()
                    self.last_error = None
                    return await r.json()
                self.last_error = f"{path} {r.status}"
                log.warning("POST %s -> %s %s", path, r.status, (await r.text())[:160])
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            self.last_error = f"{path} {type(exc).__name__}"
            log.warning("POST %s failed: %s", path, exc)
        return None

    async def _post_status(self, path: str, body: dict) -> Optional[int]:
        assert self.session is not None
        try:
            async with self.session.post(self.base + path, json=body) as r:
                return r.status
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("POST %s failed: %s", path, exc)
            return None

    async def _get(self, path: str) -> Optional[dict]:
        assert self.session is not None
        try:
            async with self.session.get(self.base + path) as r:
                if r.status == 200:
                    return await r.json()
                log.warning("GET %s -> %s", path, r.status)
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("GET %s failed: %s", path, exc)
        return None
