import asyncio
import json
import time

import aiohttp

from vehicle_companion.config import DirectConfig
from vehicle_companion.links import ticket as tickets
from vehicle_companion.links.direct import DirectServer
from vehicle_companion.mav.streams import StreamManager
from vehicle_companion.ops.executor import Executor
from vehicle_companion.ops.manual import ManualDrive
from vehicle_companion.state import StateBuilder

from conftest import make_rig

# Same vector as lib/control-center/vehicles/directTicket.test.ts.
KEY = "wQ4dBkwcNGKBtl9l88y5Ekrb1BRn9o8EhvZY_jhMY7I"
TICKET = (
    "eyJ2aWQiOiJ2ZWgxMjMiLCJzdWIiOiJ1c2VyMSIsInNjb3BlIjoiY29udHJvbCIsImV4cCI6MjAwMDAwMDAwMDAwMCwibiI6ImFiYyJ9"
    ".kV03s-wBTEgvORIRulwqirmXF0iLiuPWbOKVvm2JbmA"
)


def test_ticket_matches_the_server_vector():
    payload = {"vid": "veh123", "sub": "user1", "scope": "control", "exp": 2_000_000_000_000, "n": "abc"}
    assert tickets.sign(KEY, payload) == TICKET
    assert tickets.verify(KEY, TICKET, "veh123", 1000) == payload
    assert tickets.verify(KEY, TICKET, "other", 1000) is None
    assert tickets.verify(KEY, TICKET, "veh123", 2_000_000_000_001) is None
    assert tickets.verify("wrong", TICKET, "veh123", 1000) is None
    assert tickets.verify(KEY, TICKET[:-2] + "xx", "veh123", 1000) is None
    assert tickets.verify(KEY, "nope", "veh123", 1000) is None


async def start_direct(rig, **cfg_kwargs):
    acks: list[dict] = []
    cfg = DirectConfig(enabled=True, host="127.0.0.1", port=0, ticket_key=KEY, **cfg_kwargs)
    streams = StreamManager(rig.conn, rig.commands)
    manual = ManualDrive(rig.conn)
    builder = StateBuilder(rig.conn, rig.status, rig.clock.now_ms)
    holder = {}

    def sink(ack):
        acks.append(ack)
        holder["direct"].on_ack(ack)

    executor = Executor(rig.handlers, sink, rig.clock)
    runner = asyncio.create_task(executor.run())
    server = DirectServer(cfg, "veh123", build_state=builder.build, executor=executor, status=rig.status,
                          manual=manual, streams=streams, clock=rig.clock)
    holder["direct"] = server
    await server.start()
    return server, runner, acks, manual, streams


def ticket_for(scope="control", vid="veh123", exp=None):
    return tickets.sign(KEY, {"vid": vid, "sub": "user1", "scope": scope, "exp": exp or time.time() * 1000 + 60_000, "n": "x"})


async def recv_kind(ws, kind, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        msg = await ws.receive(timeout=deadline - time.monotonic())
        if msg.type != aiohttp.WSMsgType.TEXT:
            raise AssertionError(f"socket closed: {msg}")
        data = json.loads(msg.data)
        if data["k"] == kind:
            return data
    raise AssertionError(f"no {kind}")


async def test_ticket_auth_state_push_and_commands():
    rig = await make_rig("copter")
    server, runner, acks, _, streams = await start_direct(rig)
    try:
        async with aiohttp.ClientSession() as http:
            async with http.ws_connect(f"http://127.0.0.1:{server.port}/ws") as ws:
                await ws.send_json({"k": "auth", "ticket": ticket_for()})
                hello = await recv_kind(ws, "hello")
                assert hello["scope"] == "control" and hello["vid"] == "veh123" and hello["contract"] == 2
                state = await recv_kind(ws, "state")
                assert state["s"]["v"] == 2 and state["s"]["fc"]["ok"] is True
                # Attaching a browser raises the attitude rate for the HUD.
                assert streams.effective_rates()["ATTITUDE"] == 10.0

                await ws.send_json({"k": "cmd", "cmd": {"id": "d_abc1", "type": "set_mode", "args": {"mode": "GUIDED"}}})
                ack = await recv_kind(ws, "ack")
                assert ack["a"]["id"] == "d_abc1" and ack["a"]["st"] == "acked"
                assert rig.fake.mode == "GUIDED"

                await ws.send_json({"k": "ping", "t": 5})
                pong = await recv_kind(ws, "pong")
                assert pong["t"] == 5

                await ws.send_json({"k": "op", "on": True})
                await asyncio.sleep(0.05)
                assert server.operator_present
            await asyncio.sleep(0.1)
            assert not server.operator_present
            assert "ATTITUDE" not in streams._boost
    finally:
        runner.cancel()
        await server.stop()
        rig.fake.stop()
        rig.conn.stop()


async def test_view_ticket_cannot_command_and_bad_ticket_is_closed():
    rig = await make_rig("copter")
    server, runner, acks, _, _ = await start_direct(rig)
    try:
        async with aiohttp.ClientSession() as http:
            async with http.ws_connect(f"http://127.0.0.1:{server.port}/ws") as ws:
                await ws.send_json({"k": "auth", "ticket": ticket_for(scope="view")})
                await recv_kind(ws, "hello")
                await ws.send_json({"k": "cmd", "cmd": {"id": "d_x", "type": "arm", "args": {}}})
                err = await recv_kind(ws, "error")
                assert err["code"] == "VIEW_ONLY"
            assert not rig.fake.armed

            for bad in (ticket_for(vid="other"), ticket_for(exp=1000), "garbage"):
                async with http.ws_connect(f"http://127.0.0.1:{server.port}/ws") as ws:
                    await ws.send_json({"k": "auth", "ticket": bad})
                    msg = await ws.receive(timeout=3)
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        assert json.loads(msg.data)["code"] == "UNAUTHORIZED"
                        msg = await ws.receive(timeout=3)
                    assert msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED)
    finally:
        runner.cancel()
        await server.stop()
        rig.fake.stop()
        rig.conn.stop()


async def test_pin_attempts_are_rate_limited_and_origin_is_checked():
    rig = await make_rig("copter")
    server, runner, _, _, _ = await start_direct(rig, pin="2468", allowed_origins=["https://cc.example.com"])
    try:
        async with aiohttp.ClientSession() as http:
            url = f"http://127.0.0.1:{server.port}/ws"
            try:
                async with http.ws_connect(url, headers={"Origin": "https://evil.example"}):
                    raise AssertionError("foreign origin was accepted")
            except aiohttp.WSServerHandshakeError as exc:
                assert exc.status == 403
            origin = {"Origin": "https://cc.example.com"}
            for _ in range(5):
                async with http.ws_connect(url, headers=origin) as ws:
                    await ws.send_json({"k": "auth", "pin": "0000"})
                    await ws.receive(timeout=3)
            async with http.ws_connect(url, headers=origin) as ws:
                await ws.send_json({"k": "auth", "pin": "2468"})
                err = json.loads((await ws.receive(timeout=3)).data)
                assert err["code"] == "PIN_LOCKED"
    finally:
        runner.cancel()
        await server.stop()
        rig.fake.stop()
        rig.conn.stop()


async def test_rover_joystick_drives_and_deadman_stops():
    rig = await make_rig("rover")
    server, runner, _, manual, _ = await start_direct(rig)
    try:
        await rig.handlers.run({"id": "m", "type": "set_mode", "args": {"mode": "GUIDED"}})
        await rig.handlers.run({"id": "a", "type": "arm", "args": {}})
        start = (rig.fake.lat, rig.fake.lon)
        async with aiohttp.ClientSession() as http:
            async with http.ws_connect(f"http://127.0.0.1:{server.port}/ws") as ws:
                await ws.send_json({"k": "auth", "ticket": ticket_for()})
                await recv_kind(ws, "hello")
                for _ in range(8):
                    await ws.send_json({"k": "manual", "vx": 1.5, "yr": 0.2})
                    await asyncio.sleep(0.1)
                assert rig.fake.manual is not None
                moved = (rig.fake.lat, rig.fake.lon) != start
                assert moved
                # Stop sending: within the deadman window the rover gets an explicit zero.
                await asyncio.sleep(0.6)
                assert not manual.active
                assert rig.fake.manual is not None and rig.fake.manual[0] == 0.0
                # Values are clamped to the configured limits.
                manual.update(99, 99)
                assert manual._vx == manual.max_speed and manual._yr == manual.max_yaw_rate
                manual.stop()
    finally:
        runner.cancel()
        await server.stop()
        rig.fake.stop()
        rig.conn.stop()
