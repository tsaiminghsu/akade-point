import asyncio
import base64
import hashlib
import json
import time
from pathlib import Path
from types import SimpleNamespace

from aiohttp import web

from vehicle_companion.links.uploader import (
    Candidate,
    Uploader,
    dataflash_candidates,
    photo_candidates,
    tlog_candidates,
)


class FakeFiles:
    """The device file API, in local mode (PUT to our route, with the token)
    or S3 mode (PUT to a presigned-looking URL, no token, checksum header)."""

    def __init__(self, s3: bool = False):
        self.s3 = s3
        self.records: dict[str, dict] = {}
        self.blobs: dict[str, bytes] = {}
        self.puts: list[dict] = []
        self.announces: list[dict] = []
        self.no_storage = False
        self.fail_puts = 0
        self.base = ""

    def app(self):
        app = web.Application(client_max_size=64 * 1024 * 1024)
        app.router.add_post("/api/device/vehicles/files", self.announce)
        app.router.add_put("/api/device/vehicles/files/{fid}/content", self.put_local)
        app.router.add_put("/s3/{fid}", self.put_s3)
        app.router.add_post("/api/device/vehicles/files/{fid}/complete", self.complete)
        return app

    async def announce(self, req):
        assert req.headers["Authorization"] == "Bearer vt_test"
        if self.no_storage:
            return web.json_response({"code": "NO_STORAGE"}, status=503)
        body = await req.json()
        self.announces.append(body)
        if not body["name"].endswith((".jpg", ".tlog", ".bin")):
            return web.json_response({"error": "Invalid request"}, status=400)
        fid = f"{body['kind']}.{body['t']:013d}.{body['sha256'][:16]}"
        rec = self.records.get(fid)
        if rec and rec["status"] == "stored":
            return web.json_response({"fileId": fid, "already": True})
        self.records[fid] = {**body, "status": "pending"}
        if self.s3:
            b64 = base64.b64encode(bytes.fromhex(body["sha256"])).decode()
            upload = {"url": f"{self.base}/s3/{fid}?X-Amz-Signature=abc", "method": "PUT", "headers": {"Content-Type": "image/jpeg", "x-amz-checksum-sha256": b64}, "auth": False}
        else:
            upload = {"url": f"/api/device/vehicles/files/{fid}/content", "method": "PUT", "headers": {"Content-Type": "image/jpeg"}, "auth": True}
        return web.json_response({"fileId": fid, "upload": upload})

    async def _store(self, req, fid):
        if self.fail_puts:
            self.fail_puts -= 1
            return web.Response(status=403, text="Request has expired")
        data = await req.read()
        self.puts.append({"fid": fid, "headers": dict(req.headers), "n": len(data)})
        rec = self.records[fid]
        assert len(data) == rec["bytes"]
        assert hashlib.sha256(data).hexdigest() == rec["sha256"]
        self.blobs[fid] = data
        return web.Response(status=200)

    async def put_local(self, req):
        assert req.headers["Authorization"] == "Bearer vt_test"
        return await self._store(req, req.match_info["fid"])

    async def put_s3(self, req):
        assert "Authorization" not in req.headers  # never leak the device token to S3
        assert req.headers.get("Transfer-Encoding") is None  # S3 needs a Content-Length
        fid = req.match_info["fid"]
        want = base64.b64encode(bytes.fromhex(self.records[fid]["sha256"])).decode()
        assert req.headers["x-amz-checksum-sha256"] == want
        return await self._store(req, fid)

    async def complete(self, req):
        fid = req.match_info["fid"]
        if fid not in self.blobs:
            return web.json_response({"code": "MISSING"}, status=409)
        self.records[fid]["status"] = "stored"
        return web.json_response({"ok": True})


async def serve(fake: FakeFiles):
    runner = web.AppRunner(fake.app())
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    fake.base = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
    return runner


def make_camera(tmp: Path, n: int = 2):
    d = tmp / "photos"
    d.mkdir()
    photos = []
    for i in range(1, n + 1):
        name = f"IMG_{i:05d}_20260928T12000{i}Z.jpg"
        (d / name).write_bytes(b"\xff\xd8" + bytes([i]) * 5000 + b"\xff\xd9")
        photos.append(SimpleNamespace(name=name, t=1_759_060_800_000 + i, lat=24.1 + i / 1e4, lon=120.6, alt=50.0, rel=20.0, hdg=None))
    photos.append(SimpleNamespace(name="IMG_09999_20260928T130000Z.jpg", t=1_759_064_400_000, lat=None, lon=None, alt=None, rel=None, hdg=None))
    (d / photos[-1].name).write_bytes(b"\xff\xd8nogps\xff\xd9")
    return SimpleNamespace(dir=d, photos=photos)


def make_tlogs(tmp: Path):
    d = tmp / "tlogs"
    d.mkdir()
    files = {"20260928-110000-boot.tlog": 300, "20260928-120000-flight.tlog": 40_000, "20260928-121000-boot.tlog": 500}
    for name, n in files.items():
        (d / name).write_bytes(b"t" * n)
    out = [{"name": k, "bytes": v, "mtime": 1_759_000_000_000, "active": k.endswith("121000-boot.tlog")} for k, v in files.items()]
    return SimpleNamespace(dir=d, list_files=lambda: out)


def uploader(fake, tmp, sources, **kw):
    kw.setdefault("online", lambda: True)
    kw.setdefault("armed", lambda: False)
    return Uploader(fake.base, "vt_test", state_file=tmp / "upload-state.json", sources=sources, idle_s=0.05, **kw)


async def drain(up: Uploader, timeout: float = 5.0):
    task = asyncio.create_task(up.run())
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            await asyncio.sleep(0.05)
            if not up.queue() and up.current is None:
                break
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


def test_photos_go_up_with_their_geotag_and_only_once(tmp_path):
    async def go():
        fake = FakeFiles()
        runner = await serve(fake)
        cam = make_camera(tmp_path)
        up = uploader(fake, tmp_path, [lambda: photo_candidates(cam)])
        await up.start()
        await drain(up)
        await up.close()
        assert len(fake.blobs) == 3 and len(fake.puts) == 3
        geo = [a.get("geo") for a in fake.announces]
        assert geo[0] == {"lat": 24.1001, "lon": 120.6, "alt": 50.0, "rel": 20.0, "hdg": None}
        assert geo[2] is None  # a photo without a fix carries no geotag
        assert all(a["t"] > 1_759_000_000_000 for a in fake.announces)

        # A restart reads the state file and sends nothing again.
        up2 = uploader(fake, tmp_path, [lambda: photo_candidates(cam)])
        assert up2.queue() == []
        # Lost state (crash before saving): the server recognises the content.
        (tmp_path / "upload-state.json").unlink()
        up3 = uploader(fake, tmp_path, [lambda: photo_candidates(cam)])
        await up3.start()
        await drain(up3)
        await up3.close()
        assert len(fake.puts) == 3  # announced again, but no second upload
        await runner.cleanup()

    asyncio.run(go())


def test_s3_mode_sends_checksum_and_length_but_not_the_token(tmp_path):
    async def go():
        fake = FakeFiles(s3=True)
        runner = await serve(fake)
        cam = make_camera(tmp_path, n=1)
        up = uploader(fake, tmp_path, [lambda: photo_candidates(cam)])
        await up.start()
        await drain(up)
        await up.close()
        assert len(fake.blobs) == 2
        assert all(p["headers"]["Content-Length"] == str(p["n"]) for p in fake.puts)
        await runner.cleanup()

    asyncio.run(go())


def test_logs_wait_for_disarm_and_the_open_tlog_is_never_sent(tmp_path):
    async def go():
        fake = FakeFiles()
        runner = await serve(fake)
        cam = make_camera(tmp_path, n=1)
        tl = make_tlogs(tmp_path)
        armed = {"v": True}
        sources = [lambda: photo_candidates(cam), lambda: tlog_candidates(tl, lambda: 0, "flights")]
        up = uploader(fake, tmp_path, sources, armed=lambda: armed["v"])
        await up.start()
        await drain(up)
        assert {a["kind"] for a in fake.announces} == {"photo"}
        armed["v"] = False
        await drain(up)
        await up.close()
        tlogs = [a["name"] for a in fake.announces if a["kind"] == "tlog"]
        assert tlogs == ["20260928-120000-flight.tlog"]  # not the boot log, not the open one
        await runner.cleanup()

    asyncio.run(go())


def test_all_mode_takes_closed_boot_logs_too_and_dataflash_time_comes_from_its_name(tmp_path):
    tl = make_tlogs(tmp_path)
    names = [c.name for c in tlog_candidates(tl, lambda: 5, "all")]
    assert names == ["20260928-110000-boot.tlog", "20260928-120000-flight.tlog"]
    assert tlog_candidates(tl, lambda: 5, "all")[0].t == 1_759_000_000_005  # Pi clock moved onto the server's
    d = tmp_path / "df"
    d.mkdir()
    (d / "003-20260928T120000Z.bin").write_bytes(b"x")
    df = SimpleNamespace(dir=d, list_files=lambda: [{"name": "003-20260928T120000Z.bin", "bytes": 1, "mtime": 1}])
    assert dataflash_candidates(df, lambda: 0)[0].t == 1_790_596_800_000  # 2026-09-28T12:00:00Z


def test_no_storage_pauses_and_a_refused_file_is_not_offered_again(tmp_path):
    async def go():
        fake = FakeFiles()
        fake.no_storage = True
        runner = await serve(fake)
        cam = make_camera(tmp_path, n=1)
        up = uploader(fake, tmp_path, [lambda: photo_candidates(cam)])
        await up.start()
        await drain(up, timeout=0.5)
        assert up.error == "NO_STORAGE" and up.state_block()["paused"] is True
        assert fake.announces == []

        bad = tmp_path / "notes.txt"
        bad.write_text("x")
        fake.no_storage = False
        up2 = uploader(fake, tmp_path, [lambda: [Candidate("photo", "notes.txt", bad, 1)]])
        await up2.start()
        await drain(up2, timeout=1)
        await up2.close()
        await up.close()
        assert "photo/notes.txt" in up2.rejected and up2.queue() == []
        assert "photo/notes.txt" in json.loads((tmp_path / "upload-state.json").read_text())["rejected"]
        await runner.cleanup()

    asyncio.run(go())


def test_an_expired_upload_url_is_retried_with_a_fresh_one(tmp_path):
    async def go():
        fake = FakeFiles(s3=True)
        fake.fail_puts = 1
        runner = await serve(fake)
        cam = make_camera(tmp_path, n=1)
        up = uploader(fake, tmp_path, [lambda: photo_candidates(cam)])
        await up.start()
        await drain(up, timeout=1)
        # The first photo waits for a retry; the other one went up meanwhile.
        assert list(up._retry_at) == ["photo/IMG_00001_20260928T120001Z.jpg"] and len(fake.blobs) == 1
        up._retry_at.clear()  # skip the 30 s wait
        await drain(up)
        await up.close()
        assert len(fake.blobs) == 2 and up.error is None
        await runner.cleanup()

    asyncio.run(go())


def test_uplink_cap(tmp_path):
    async def go():
        fake = FakeFiles()
        runner = await serve(fake)
        f = tmp_path / "003-20260928T120000Z.bin"
        f.write_bytes(b"d" * 200_000)
        up = uploader(fake, tmp_path, [lambda: [Candidate("dataflash", f.name, f, 1)]], max_kbps=4000)  # 500 kB/s
        await up.start()
        started = time.monotonic()
        await drain(up)
        took = time.monotonic() - started
        await up.close()
        assert len(fake.blobs) == 1
        assert took >= 0.3  # 200 kB at 500 kB/s is 0.4 s
        await runner.cleanup()

    asyncio.run(go())


def test_offline_means_no_attempts(tmp_path):
    fake = FakeFiles()
    cam = make_camera(tmp_path, n=1)
    up = uploader(fake, tmp_path, [lambda: photo_candidates(cam)], online=lambda: False)

    async def go():
        await drain(up, timeout=0.3)

    asyncio.run(go())
    assert up.sent == 0 and up.pending == []
