"""Direct link: a WebSocket the ground-station page opens straight to the Pi.

Over LAN or a VPN such as Tailscale this gives 10 Hz state, pushed
STATUSTEXT and acks, and it keeps working when the Control Center or the 4G
uplink is down (once the page is loaded). Joystick driving and continuous
gimbal control only ever use this link.

Protocol (JSON text frames). The first client frame must authenticate within
AUTH_TIMEOUT_S:
  → {"k":"auth","ticket":"…"}   ticket signed by the Control Center
  → {"k":"auth","pin":"1234"}   optional field PIN from the config
  ← {"k":"hello", vid, scope, sub, contract, now, msgs:[recent STATUSTEXT]}
then
  ← {"k":"state","s":{…}}      10 Hz
  ← {"k":"msg","e":{…}}        each STATUSTEXT
  ← {"k":"ack","a":{…}}        every command ack (direct and cloud)
  → {"k":"cmd","cmd":{"id":"d_…","type":…,"args":{…}}}     control scope
  → {"k":"manual","vx":m/s,"yr":rad/s}                       control scope
  → {"k":"op","on":true}       this operator holds control (heartbeat policy)
  → {"k":"gimbal","p":deg,"y":deg,"lock":bool}  continuous gimbal angles (≤10 Hz sent)
  → {"k":"ping","t":…}  ← {"k":"pong","t":…,"now":…}
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Callable, Optional

from aiohttp import WSMsgType, web

from . import ticket as tickets

log = logging.getLogger(__name__)

AUTH_TIMEOUT_S = 5.0
STATE_HZ = 10.0
PIN_MAX_FAILURES = 5
PIN_WINDOW_S = 60.0
DIRECT_CMD_TTL_MS = 10_000
BOOSTED_RATES = {"ATTITUDE": 10.0, "VFR_HUD": 5.0, "GLOBAL_POSITION_INT": 5.0}


@dataclass(eq=False)
class Client:
    ws: web.WebSocketResponse
    remote: str
    scope: str = ""
    sub: str = ""
    operator: bool = False
    connected_at: float = field(default_factory=time.monotonic)

    @property
    def authed(self) -> bool:
        return bool(self.scope)


class DirectServer:
    def __init__(self, cfg, vehicle_id: str, *, build_state: Callable[[], dict], executor, status, manual, streams, clock, tlog=None, gimbal=None, dataflash=None):
        self.cfg = cfg
        self.vehicle_id = vehicle_id
        self.build_state = build_state
        self.executor = executor
        self.status = status
        self.manual = manual
        self.streams = streams
        self.clock = clock
        self.tlog = tlog
        self.gimbal = gimbal
        self.dataflash = dataflash
        self.clients: set[Client] = set()
        self._pin_failures: dict[str, deque] = defaultdict(deque)
        self._runner: Optional[web.AppRunner] = None
        self._push_task: Optional[asyncio.Task] = None
        self.port: Optional[int] = None
        status.on_entry(lambda e: self._broadcast({"k": "msg", "e": e}))

    # ---- lifecycle -----------------------------------------------------

    def app(self) -> web.Application:
        app = web.Application()
        app.router.add_get("/ws", self._ws)
        app.router.add_get("/health", self._health)
        app.router.add_route("OPTIONS", "/files/{tail:.*}", self._preflight)
        app.router.add_get("/files/tlogs", self._tlog_list)
        app.router.add_get("/files/tlogs/{name}", self._tlog_get)
        app.router.add_get("/files/logs", self._log_list)
        app.router.add_get("/files/logs/{name}", self._log_get)
        return app

    async def start(self) -> None:
        self._runner = web.AppRunner(self.app())
        await self._runner.setup()
        site = web.TCPSite(self._runner, self.cfg.host, self.cfg.port)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1] if site._server and site._server.sockets else self.cfg.port
        self._push_task = asyncio.create_task(self._push_loop(), name="direct-push")
        log.info("direct link listening on %s:%s", self.cfg.host, self.port)

    async def stop(self) -> None:
        if self._push_task:
            self._push_task.cancel()
        for c in list(self.clients):
            await c.ws.close()
        if self._runner:
            await self._runner.cleanup()

    @property
    def operator_present(self) -> bool:
        return any(c.authed and c.scope == "control" and c.operator and not c.ws.closed for c in self.clients)

    @property
    def authed_count(self) -> int:
        return sum(1 for c in self.clients if c.authed and not c.ws.closed)

    # ---- outbound ------------------------------------------------------

    def _broadcast(self, message: dict) -> None:
        if not self.clients:
            return
        data = json.dumps(message, separators=(",", ":"))
        for c in list(self.clients):
            if c.authed and not c.ws.closed:
                asyncio.ensure_future(self._safe_send(c, data))

    async def _safe_send(self, c: Client, data: str) -> None:
        try:
            await c.ws.send_str(data)
        except (ConnectionResetError, RuntimeError):
            pass

    def on_ack(self, ack: dict) -> None:
        self._broadcast({"k": "ack", "a": ack})

    async def _push_loop(self) -> None:
        while True:
            await asyncio.sleep(1.0 / STATE_HZ)
            if self.authed_count == 0:
                continue
            try:
                self._broadcast({"k": "state", "s": self.build_state()})
            except Exception:
                log.exception("direct state push failed")

    def _update_rates(self) -> None:
        boosted = self.authed_count > 0
        for name, hz in BOOSTED_RATES.items():
            self.streams.boost(name, hz if boosted else None)

    # ---- http ----------------------------------------------------------

    async def _health(self, request: web.Request) -> web.Response:
        return web.json_response(
            {"ok": True, "vid": self.vehicle_id, "clients": self.authed_count},
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"},
        )

    # ---- files (tlogs) ------------------------------------------------------
    # Plain HTTP so the browser can download large files; authorised with the
    # same ticket as the socket, sent as "Authorization: Ticket <ticket>".

    def _cors(self, request: web.Request) -> dict:
        origin = request.headers.get("Origin", "")
        allowed = not self.cfg.allowed_origins or origin in self.cfg.allowed_origins
        return {
            "Access-Control-Allow-Origin": origin if (origin and allowed) else "null",
            "Access-Control-Allow-Headers": "Authorization",
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Vary": "Origin",
        }

    async def _preflight(self, request: web.Request) -> web.Response:
        return web.Response(status=204, headers=self._cors(request))

    def _file_auth(self, request: web.Request) -> bool:
        if not self._origin_ok(request):
            return False
        header = request.headers.get("Authorization", "")
        if header.startswith("Ticket "):
            return tickets.verify(self.cfg.ticket_key, header[7:], self.vehicle_id, self.clock.now_ms()) is not None
        if header.startswith("Pin ") and self.cfg.pin:
            remote = request.remote or "?"
            if self._pin_blocked(remote):
                return False
            if hmac.compare_digest(header[4:].encode(), self.cfg.pin.encode()):
                return True
            self._pin_failures[remote].append(time.monotonic())
        return False

    async def _tlog_list(self, request: web.Request) -> web.Response:
        headers = self._cors(request)
        if not self._file_auth(request):
            return web.json_response({"error": "unauthorized"}, status=401, headers=headers)
        files = self.tlog.list_files() if self.tlog is not None else []
        return web.json_response({"files": files, "enabled": self.tlog is not None}, headers=headers)

    async def _tlog_get(self, request: web.Request) -> web.StreamResponse:
        headers = self._cors(request)
        if not self._file_auth(request):
            return web.json_response({"error": "unauthorized"}, status=401, headers=headers)
        path = self.tlog.resolve(request.match_info["name"]) if self.tlog is not None else None
        if path is None:
            return web.json_response({"error": "not found"}, status=404, headers=headers)
        headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
        return web.FileResponse(path, headers=headers)

    async def _log_list(self, request: web.Request) -> web.Response:
        headers = self._cors(request)
        if not self._file_auth(request):
            return web.json_response({"error": "unauthorized"}, status=401, headers=headers)
        files = self.dataflash.list_files() if self.dataflash is not None else []
        return web.json_response({"files": files, "enabled": self.dataflash is not None}, headers=headers)

    async def _log_get(self, request: web.Request) -> web.StreamResponse:
        headers = self._cors(request)
        if not self._file_auth(request):
            return web.json_response({"error": "unauthorized"}, status=401, headers=headers)
        path = self.dataflash.resolve(request.match_info["name"]) if self.dataflash is not None else None
        if path is None:
            return web.json_response({"error": "not found"}, status=404, headers=headers)
        headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
        return web.FileResponse(path, headers=headers)

    def _origin_ok(self, request: web.Request) -> bool:
        allowed = self.cfg.allowed_origins
        if not allowed:
            return True
        return request.headers.get("Origin", "") in allowed

    async def _ws(self, request: web.Request) -> web.StreamResponse:
        if not self._origin_ok(request):
            return web.Response(status=403, text="origin not allowed")
        # Protocol-level ping/pong every 2 s: browsers answer pings even from a
        # background tab, so presence does not depend on page timers.
        ws = web.WebSocketResponse(heartbeat=2.0, max_msg_size=64 * 1024)
        await ws.prepare(request)
        client = Client(ws, request.remote or "?")
        self.clients.add(client)
        try:
            if not await self._authenticate(client):
                await ws.close(code=4401, message=b"unauthorized")
                return ws
            self._update_rates()
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    data = json.loads(msg.data)
                except json.JSONDecodeError:
                    continue
                await self._handle(client, data)
        finally:
            self.clients.discard(client)
            if client.scope == "control":
                self.manual.stop()
            self._update_rates()
        return ws

    async def _authenticate(self, client: Client) -> bool:
        try:
            msg = await client.ws.receive(timeout=AUTH_TIMEOUT_S)
        except asyncio.TimeoutError:
            return False
        if msg.type != WSMsgType.TEXT:
            return False
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            return False
        if data.get("k") != "auth":
            return False
        payload = None
        if "ticket" in data:
            payload = tickets.verify(self.cfg.ticket_key, data["ticket"], self.vehicle_id, self.clock.now_ms())
            if payload:
                client.scope, client.sub = payload["scope"], str(payload.get("sub", ""))
        elif "pin" in data and self.cfg.pin:
            if self._pin_blocked(client.remote):
                await client.ws.send_json({"k": "error", "code": "PIN_LOCKED", "msg": "too many attempts"})
                return False
            if hmac.compare_digest(str(data["pin"]).encode(), self.cfg.pin.encode()):
                client.scope, client.sub = "control", "pin"
            else:
                self._pin_failures[client.remote].append(time.monotonic())
        if not client.authed:
            await client.ws.send_json({"k": "error", "code": "UNAUTHORIZED"})
            return False
        await client.ws.send_json(
            {
                "k": "hello",
                "vid": self.vehicle_id,
                "scope": client.scope,
                "sub": client.sub,
                "contract": 2,
                "now": self.clock.now_ms(),
                "msgs": self.status.recent(50),
            }
        )
        return True

    def _pin_blocked(self, remote: str) -> bool:
        q = self._pin_failures[remote]
        now = time.monotonic()
        while q and now - q[0] > PIN_WINDOW_S:
            q.popleft()
        return len(q) >= PIN_MAX_FAILURES

    # ---- inbound -------------------------------------------------------

    async def _handle(self, client: Client, data: dict) -> None:
        k = data.get("k")
        if k == "ping":
            await client.ws.send_json({"k": "pong", "t": data.get("t"), "now": self.clock.now_ms()})
            return
        if client.scope != "control":
            if k in ("cmd", "manual", "op", "gimbal"):
                await client.ws.send_json({"k": "error", "code": "VIEW_ONLY"})
            return
        if k == "cmd":
            cmd = data.get("cmd") or {}
            cid = str(cmd.get("id", ""))
            if not cid.startswith("d_") or not cmd.get("type"):
                await client.ws.send_json({"k": "error", "code": "BAD_COMMAND"})
                return
            now = self.clock.now_ms()
            self.executor.submit(
                {
                    "id": cid,
                    "type": str(cmd["type"]),
                    "args": cmd.get("args") or {},
                    "iat": now,
                    "exp": now + DIRECT_CMD_TTL_MS,
                    "via": "direct",
                    "sub": client.sub,
                }
            )
        elif k == "manual":
            try:
                self.manual.update(float(data.get("vx", 0)), float(data.get("yr", 0)))
            except (TypeError, ValueError):
                pass
        elif k == "op":
            client.operator = bool(data.get("on"))
        elif k == "gimbal" and self.gimbal is not None:
            try:
                self.gimbal.update(float(data.get("p", 0)), float(data.get("y", 0)), bool(data.get("lock")))
            except (TypeError, ValueError):
                pass
