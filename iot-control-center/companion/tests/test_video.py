from aiohttp import web

from vehicle_companion.clock import Clock
from vehicle_companion.links.video import VideoControl
from vehicle_companion.mav.command import CommandClient
from vehicle_companion.mav.connection import MavConnection
from vehicle_companion.mav.mission import MissionClient
from vehicle_companion.mav.params import ParamClient
from vehicle_companion.mav.statustext import StatusLog
from vehicle_companion.ops.handlers import Handlers


async def fake_mediamtx():
    state = {"record": False, "patches": []}

    async def path_get(req):
        if req.match_info["name"] != "cam":
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response({"name": "cam", "ready": True, "readers": [{"type": "webRTCSession"}]})

    async def conf_get(req):
        return web.json_response({"name": "cam", "record": state["record"]})

    async def conf_patch(req):
        body = await req.json()
        state["patches"].append(body)
        state["record"] = body.get("record", state["record"])
        return web.Response(status=200)

    app = web.Application()
    app.router.add_get("/v3/paths/get/{name}", path_get)
    app.router.add_get("/v3/config/paths/get/{name}", conf_get)
    app.router.add_patch("/v3/config/paths/patch/{name}", conf_patch)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    return runner, f"http://127.0.0.1:{port}", state


async def test_status_and_recording_toggle():
    runner, url, state = await fake_mediamtx()
    video = VideoControl(url, "cam")
    await video.start()
    try:
        s = await video.refresh()
        assert s["ready"] is True and s["readers"] == 1 and s["recording"] is False
        assert video.state_block() == {"ready": True, "readers": 1, "rec": False}
        ok, code = await video.set_recording(True)
        assert ok and code == "OK"
        assert state["patches"] == [{"record": True}]
        assert video.state_block()["rec"] is True
    finally:
        await video.close()
        await runner.cleanup()


async def test_unreachable_mediamtx_reports_no_video_and_fails_commands():
    video = VideoControl("http://127.0.0.1:9", "cam")
    await video.start()
    try:
        assert await video.refresh() is None
        assert video.state_block() is None
        ok, code = await video.set_recording(True)
        assert not ok and code.startswith("MEDIAMTX_UNREACHABLE")
    finally:
        await video.close()


async def test_video_record_command_without_video_config():
    conn = MavConnection("udpin:127.0.0.1:0")
    clock = Clock()
    h = Handlers(conn, CommandClient(conn), MissionClient(conn), ParamClient(conn), StatusLog(clock.now_ms), clock.now_ms)
    ack = await h.run({"id": "v", "type": "video_record", "args": {"on": True}})
    assert ack["code"] == "NO_VIDEO"
