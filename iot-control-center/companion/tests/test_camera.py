import asyncio
import struct

from vehicle_companion.mav.proto import mavlink
from vehicle_companion.ops.camera import CameraComponent, TestCapture

from conftest import make_rig


def exif_gps(jpeg: bytes) -> tuple[float, float]:
    """Latitude/longitude from our EXIF (little-endian TIFF), independent of the writer."""
    i = jpeg.index(b"Exif\x00\x00") + 6
    tiff = jpeg[i:]
    u16 = lambda o: struct.unpack_from("<H", tiff, o)[0]
    u32 = lambda o: struct.unpack_from("<I", tiff, o)[0]

    def entries(ifd):
        return {u16(ifd + 2 + 12 * k): ifd + 2 + 12 * k for k in range(u16(ifd))}

    gps = u32(entries(u32(4))[0x8825] + 8)
    e = entries(gps)

    def dms(tag):
        off = u32(e[tag] + 8)
        d, m, s = (u32(off + 8 * k) / u32(off + 8 * k + 4) for k in range(3))
        return d + m / 60 + s / 3600

    lat = dms(2) * (-1 if tiff[e[1] + 8] == ord("S") else 1)
    lon = dms(4) * (-1 if tiff[e[3] + 8] == ord("W") else 1)
    return lat, lon


async def camera_rig(tmp_path):
    rig = await make_rig("copter")
    cam = CameraComponent(rig.conn, TestCapture(), tmp_path / "photos")
    rig.conn.add_listener("COMMAND_LONG", cam.on_command)
    task = asyncio.create_task(cam.run())
    return rig, cam, task


async def wait_for(fn, timeout=3.0):
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while loop.time() < end:
        v = fn()
        if v:
            return v
        await asyncio.sleep(0.05)
    return fn()


async def test_autopilot_finds_the_camera_and_triggers_a_geotagged_photo(tmp_path):
    rig, cam, task = await camera_rig(tmp_path)
    try:
        # The camera announces itself as component 100 of the vehicle's system.
        hb = await wait_for(lambda: [m for m in rig.fake.from_camera if m.get_type() == "HEARTBEAT"])
        assert hb and hb[0].type == mavlink.MAV_TYPE_CAMERA and hb[0].get_srcSystem() == rig.fake.sysid

        # AP_Camera (CAM1_TYPE=6) asks for CAMERA_INFORMATION, then triggers.
        rig.fake.mav.command_long_send(rig.fake.sysid, 100, 512, 0, mavlink.MAVLINK_MSG_ID_CAMERA_INFORMATION, 0, 0, 0, 0, 0, 0)
        info = await wait_for(lambda: [m for m in rig.fake.from_camera if m.get_type() == "CAMERA_INFORMATION"])
        assert info and info[0].flags & mavlink.CAMERA_CAP_FLAGS_CAPTURE_IMAGE
        rig.fake.mav.command_long_send(rig.fake.sysid, 100, 2000, 0, 0, 0, 1, 1, 0, 0, 0)
        cap = await wait_for(lambda: [m for m in rig.fake.from_camera if m.get_type() == "CAMERA_IMAGE_CAPTURED"])
        acks = [m for m in rig.fake.from_camera if m.get_type() == "COMMAND_ACK" and m.command == 2000]
        assert acks and acks[0].result == mavlink.MAV_RESULT_ACCEPTED and acks[0].target_component == 1

        c = cap[0]
        assert c.capture_result == 1 and c.image_index == 1
        assert abs(c.lat / 1e7 - rig.fake.lat) < 1e-4 and abs(c.lon / 1e7 - rig.fake.lon) < 1e-4
        path = tmp_path / "photos" / cam.photos[0].name
        assert c.file_url.rstrip("\x00").endswith(path.name)
        lat, lon = exif_gps(path.read_bytes())
        assert abs(lat - rig.fake.lat) < 1e-4 and abs(lon - rig.fake.lon) < 1e-4
        assert cam.state_block()["n"] == 1 and cam.photos[0].trigger == "autopilot"
    finally:
        task.cancel()
        rig.fake.stop()
        rig.conn.stop()


async def test_ground_station_capture_interval_and_stop(tmp_path):
    rig, cam, task = await camera_rig(tmp_path)
    rig.handlers.camera = cam
    try:
        ack = await rig.handlers.run({"id": "c1", "type": "camera_capture", "args": {}})
        assert ack["st"] == "acked" and ack["res"]["photo"]["idx"] == 1
        ack = await rig.handlers.run({"id": "c2", "type": "camera_capture", "args": {"interval": 0.5, "count": 3}})
        assert ack["st"] == "acked"
        assert await wait_for(lambda: len(cam.photos) >= 4, 5.0)
        assert cam.state_block()["interval"] is None  # three shots, then done
        ack = await rig.handlers.run({"id": "c3", "type": "camera_capture", "args": {"interval": 0.5}})
        await asyncio.sleep(0.8)
        await rig.handlers.run({"id": "c4", "type": "camera_stop", "args": {}})
        n = len(cam.photos)
        await asyncio.sleep(1.0)
        assert len(cam.photos) == n  # stopped
        # A restart reads the index back.
        again = CameraComponent(rig.conn, TestCapture(), tmp_path / "photos")
        assert [p.idx for p in again.photos] == [p.idx for p in cam.photos]
        assert again.resolve(cam.photos[0].name) is not None
        assert again.resolve("../index.jsonl") is None and again.resolve("index.jsonl") is None
    finally:
        task.cancel()
        rig.fake.stop()
        rig.conn.stop()


async def test_disabled_camera_command_fails_cleanly():
    rig = await make_rig("copter")
    try:
        ack = await rig.handlers.run({"id": "x", "type": "camera_capture", "args": {}})
        assert ack["st"] == "failed" and ack["code"] == "NO_CAMERA"
    finally:
        rig.fake.stop()
        rig.conn.stop()
