import asyncio

from vehicle_companion.mav.connection import MavConnection
from vehicle_companion.mav.logs import DataflashClient, file_name
from vehicle_companion.mav.proto import mavlink

from conftest import make_rig


async def rig_with_logs(tmp_path, **kw):
    rig = await make_rig("copter", **kw)
    rig.handlers.dataflash = DataflashClient(rig.conn, tmp_path / "dataflash", idle_timeout=0.3, list_timeout=1.0)
    return rig


def stop(rig):
    rig.fake.stop()
    rig.conn.stop()


async def test_list_and_download_with_lost_packets(tmp_path):
    rig = await rig_with_logs(tmp_path)
    try:
        ack = await rig.handlers.run({"id": "l1", "type": "log_list", "args": {}})
        assert ack["st"] == "acked", ack
        logs = ack["res"]["logs"]
        assert [(e["id"], e["size"]) for e in logs] == [(1, 12_345), (2, 200_000)]
        assert logs[1]["name"] == file_name(2, 1_790_003_600) and logs[1]["onPi"] is False

        # Lose a few packets, including the very last one.
        rig.fake.drop_log_offsets = {0, 90 * 500, 90 * 2000, 199_980}
        ack = await rig.handlers.run({"id": "l2", "type": "log_download", "args": {"id": 2, "size": 200_000, "utc": 1_790_003_600}})
        assert ack["st"] == "acked", ack
        path = tmp_path / "dataflash" / ack["res"]["name"]
        assert path.read_bytes() == rig.fake.dataflash[2][0]
        assert not list((tmp_path / "dataflash").glob("*.part"))
        # The holes were asked for again.
        assert any(ofs == 0 for (_i, ofs, _n) in rig.fake.log_requests[1:])
        assert rig.handlers.dataflash.state_block()["done"] is True

        again = await rig.handlers.run({"id": "l3", "type": "log_list", "args": {}})
        assert again["res"]["logs"][1]["onPi"] is True
        assert [f["name"] for f in rig.handlers.dataflash.list_files()] == [path.name]
    finally:
        stop(rig)


async def test_refused_while_armed(tmp_path):
    rig = await rig_with_logs(tmp_path)
    try:
        rig.fake.armed = True
        for _ in range(40):
            if rig.conn.heartbeat() and rig.conn.heartbeat().base_mode & 128:
                break
            await asyncio.sleep(0.05)
        ack = await rig.handlers.run({"id": "a1", "type": "log_list", "args": {}})
        assert ack["st"] == "failed" and ack["code"] == "ARMED"
    finally:
        stop(rig)


async def test_cancel_removes_the_partial_file(tmp_path):
    rig = await rig_with_logs(tmp_path)
    try:
        # The autopilot goes quiet; the download keeps retrying until cancelled.
        rig.fake.log_silent = True
        task = asyncio.create_task(rig.handlers.run({"id": "c1", "type": "log_download", "args": {"id": 2, "size": 200_000}}))
        for _ in range(100):
            if rig.fake.log_requests:
                break
            await asyncio.sleep(0.02)
        await asyncio.sleep(0.5)  # one silent window: not fatal yet
        assert not task.done()
        cancel = await rig.handlers.run({"id": "c2", "type": "log_cancel", "args": {}})
        assert cancel["st"] == "acked"
        ack = await task
        assert ack["st"] == "failed" and ack["code"] == "CANCELLED"
        assert not any((tmp_path / "dataflash").iterdir())
    finally:
        stop(rig)


def test_resolve_accepts_only_log_names(tmp_path):
    d = tmp_path / "df"
    d.mkdir()
    (d / "002-20260927T120000Z.bin").write_bytes(b"x")
    c = DataflashClient(None, d)
    assert c.resolve("002-20260927T120000Z.bin") is not None
    for bad in ("../secret.bin", "002-20260927T120000Z.bin.part", "notes.txt", "..\\x.bin"):
        assert c.resolve(bad) is None


async def test_gives_up_after_repeated_silence(tmp_path):
    rig = await rig_with_logs(tmp_path)
    try:
        rig.fake.log_silent = True
        ack = await rig.handlers.run({"id": "s1", "type": "log_download", "args": {"id": 1, "size": 12_345}})
        assert ack["st"] == "failed" and ack["code"] == "TIMEOUT"
        assert len(rig.fake.log_requests) == 5
    finally:
        stop(rig)


def test_log_data_is_not_copied_into_the_tlog():
    written = []
    conn = MavConnection("udpin:127.0.0.1:0", tlog=type("T", (), {"write": lambda self, b: written.append(b), "on_heartbeat": lambda self, m: None})())
    mav = mavlink.MAVLink(None, srcSystem=1, srcComponent=1)
    for msg in (mav.log_data_encode(1, 0, 90, bytes(90)), mav.attitude_encode(0, 0, 0, 0, 0, 0, 0)):
        msg.pack(mav)
        conn._on_message(msg, 0.0)
    assert len(written) == 1
