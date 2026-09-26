import time

import aiohttp

from vehicle_companion.links import ticket as tickets
from vehicle_companion.tlog import TlogWriter

from conftest import make_rig
from test_direct import KEY, start_direct


async def test_tlog_files_need_a_ticket_and_stay_inside_the_directory(tmp_path):
    rig = await make_rig("copter")
    tlog = TlogWriter(tmp_path)
    tlog.write(b"\xfd\x09\x00\x00\x00\x01\x01\x00\x00\x00")
    tlog.close()
    server, runner, _, _, _ = await start_direct(rig)
    server.tlog = tlog
    try:
        base = f"http://127.0.0.1:{server.port}/files/tlogs"
        good = {"Authorization": "Ticket " + tickets.sign(KEY, {"vid": "veh123", "sub": "u", "scope": "view", "exp": time.time() * 1000 + 60_000, "n": "x"})}
        async with aiohttp.ClientSession() as http:
            async with http.get(base) as r:
                assert r.status == 401
            async with http.get(base, headers=good) as r:
                assert r.status == 200
                files = (await r.json())["files"]
            assert len(files) == 1 and files[0]["name"].endswith(".tlog") and files[0]["bytes"] == 18
            async with http.get(f"{base}/{files[0]['name']}", headers=good) as r:
                assert r.status == 200
                body = await r.read()
                assert body[8:] == b"\xfd\x09\x00\x00\x00\x01\x01\x00\x00\x00"
                assert "attachment" in r.headers["Content-Disposition"]
            async with http.get(f"{base}/..%2Fsecret.tlog", headers=good) as r:
                assert r.status == 404
            async with http.options(base, headers={"Origin": "http://localhost:3100"}) as r:
                assert r.status == 204 and r.headers["Access-Control-Allow-Headers"] == "Authorization"
    finally:
        runner.cancel()
        await server.stop()
        rig.fake.stop()
        rig.conn.stop()
