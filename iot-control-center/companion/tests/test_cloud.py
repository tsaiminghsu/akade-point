import asyncio
import time

from aiohttp import web

from vehicle_companion.clock import Clock
from vehicle_companion.links.cloud import CloudLink
from vehicle_companion.mav.statustext import StatusLog


class FakeServer:
    def __init__(self):
        self.telemetry: list[dict] = []
        self.acks: list[dict] = []
        self.fail_telemetry = 0
        self.fail_acks = 0
        self.commands: list[dict] = []
        self.now_offset_ms = 0

    def app(self):
        app = web.Application()
        app.router.add_post("/api/device/vehicles/telemetry", self.on_telemetry)
        app.router.add_post("/api/device/vehicles/commands/{cid}/ack", self.on_ack)
        app.router.add_get("/api/device/vehicles/missions/{mid}", self.on_mission)
        return app

    async def on_telemetry(self, req):
        assert req.headers["Authorization"] == "Bearer vt_test"
        if self.fail_telemetry:
            self.fail_telemetry -= 1
            return web.json_response({"error": "boom"}, status=503)
        self.telemetry.append(await req.json())
        cmds, self.commands = self.commands, []
        return web.json_response({"ok": True, "commands": cmds, "now": time.time() * 1000 + self.now_offset_ms, "op": True})

    async def on_ack(self, req):
        if self.fail_acks:
            self.fail_acks -= 1
            return web.json_response({"error": "down"}, status=500)
        self.acks.append(await req.json())
        return web.json_response({"ok": True})

    async def on_mission(self, req):
        return web.json_response({"mission": {"id": req.match_info["mid"], "items": [1, 2]}})


async def start(server: FakeServer):
    runner = web.AppRunner(server.app())
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    return runner, f"http://127.0.0.1:{port}"


def state(pos=True, t=1):
    return {
        "v": 2, "t": t, "armed": False, "mode": "STABILIZE", "sys": "STANDBY",
        "bat": {"v": 16.0, "a": 1.0, "pct": 90}, "gps": {"fix": 3, "sats": 12, "hdop": 0.8},
        "pos": {"lat": 25.0, "lon": 121.0, "alt": 10.0, "rel": 0.0} if pos else None,
        "hdg": 90.0, "gs": 0.0, "vs": 0.0, "wp": {"cur": 0, "n": 0}, "fw": "ArduCopter V4.5.7",
    }


async def test_telemetry_dispatches_commands_syncs_clock_and_tracks_operator():
    server = FakeServer()
    runner, base = await start(server)
    clock = Clock()
    link = CloudLink(base, "vt_test", clock, contract=1, history_every_s=0)
    got = []
    link.on_command = got.append
    await link.start()
    try:
        server.commands = [{"id": "c1", "type": "arm"}]
        server.now_offset_ms = 3_600_000  # the Pi's clock is an hour behind
        resp = await link.post_telemetry(state())
        assert resp["ok"] and got == [{"id": "c1", "type": "arm"}]
        assert clock.synced and abs(clock.offset_ms - 3_600_000) < 1000
        assert link.operator_present and link.connected
        body = server.telemetry[-1]
        assert body["state"]["v"] == 1  # projected for a contract-1 server
        assert len(body["history"]) == 1
    finally:
        await link.close()
        await runner.cleanup()


async def test_history_is_kept_until_delivered_and_skips_points_without_position():
    server = FakeServer()
    runner, base = await start(server)
    link = CloudLink(base, "vt_test", Clock(), contract=1, history_every_s=0)
    await link.start()
    try:
        server.fail_telemetry = 2
        assert await link.post_telemetry(state(t=1)) is None
        assert await link.post_telemetry(state(pos=False, t=2)) is None
        await link.post_telemetry(state(t=3))
        assert [p["t"] for p in server.telemetry[-1]["history"]] == [1, 3]
        await link.post_telemetry(state(t=4))
        assert [p["t"] for p in server.telemetry[-1]["history"]] == [4]
    finally:
        await link.close()
        await runner.cleanup()


async def test_statustext_outbox_is_requeued_on_failure_contract_2():
    server = FakeServer()
    runner, base = await start(server)
    link = CloudLink(base, "vt_test", Clock(), contract=2, history_every_s=999)
    status = StatusLog(lambda: 5)
    status._outbox.append({"seq": 1, "t": 5, "sev": 2, "text": "PreArm: x", "comp": 1})
    await link.start()
    try:
        server.fail_telemetry = 1
        await link.post_telemetry(state(), status)
        await link.post_telemetry(state(), status)
        assert server.telemetry[-1]["msgs"][0]["text"] == "PreArm: x"
        assert server.telemetry[-1]["state"]["v"] == 2
    finally:
        await link.close()
        await runner.cleanup()


async def test_acks_are_retried_until_accepted():
    server = FakeServer()
    runner, base = await start(server)
    link = CloudLink(base, "vt_test", Clock())
    await link.start()
    task = asyncio.create_task(link.ack_loop())
    try:
        server.fail_acks = 1
        link.enqueue_ack({"v": 1, "id": "c9", "st": "acked", "code": "OK", "t": 1})
        for _ in range(300):
            if server.acks:
                break
            await asyncio.sleep(0.01)
        assert [a["id"] for a in server.acks] == ["c9"]
        assert link.get_mission  # smoke: mission fetch path
        assert (await link.get_mission("m7"))["items"] == [1, 2]
    finally:
        task.cancel()
        await link.close()
        await runner.cleanup()
