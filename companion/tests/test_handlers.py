import asyncio

import pytest

from vehicle_companion.mav.mission import FENCE, MISSION, RALLY

from conftest import make_rig


def home_item(lat=25.0330, lon=121.5654):
    return {"seq": 0, "cur": 0, "frame": 0, "cmd": 16, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "lat": lat, "lon": lon, "alt": 12, "ac": 1}


def wp(seq, lat, lon, alt=20, cmd=16, frame=3):
    return {"seq": seq, "cur": 0, "frame": frame, "cmd": cmd, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "lat": lat, "lon": lon, "alt": alt, "ac": 1}


async def wait_until(pred, timeout=5.0):
    for _ in range(int(timeout / 0.02)):
        if pred():
            return True
        await asyncio.sleep(0.02)
    return False


async def run(rig, ctype, **args):
    return await rig.handlers.run({"id": f"c-{ctype}", "type": ctype, "args": args})


async def test_set_mode_and_unknown_mode(copter):
    ack = await run(copter, "set_mode", mode="guided")
    assert ack["st"] == "acked", ack
    assert copter.fake.mode == "GUIDED"
    bad = await run(copter, "set_mode", mode="HOLD")  # a rover mode
    assert bad["st"] == "failed" and bad["code"] == "BAD_MODE"


async def test_arm_failure_reports_prearm_reason():
    rig = await make_rig("copter", prearm_fail="Compass not calibrated")
    try:
        ack = await run(rig, "arm")
        assert ack["st"] == "failed"
        assert ack["code"] == "MAV_RESULT_FAILED"
        assert "Compass not calibrated" in ack["msg"]
        assert any("Compass not calibrated" in t for t in rig.status.prearm_failures())
    finally:
        rig.fake.stop()
        rig.conn.stop()


async def test_takeoff_goto_rtl(copter):
    ack = await run(copter, "takeoff", alt=10)
    assert ack["st"] == "acked", ack
    assert copter.fake.armed and copter.fake.mode == "GUIDED"
    assert await wait_until(lambda: copter.fake.alt_rel > 8)

    ack = await run(copter, "goto", lat=25.0335, lon=121.5660, alt=15)
    assert ack["st"] == "acked", ack
    # DO_REPOSITION goes out as COMMAND_INT; ArduPilot rejects it as COMMAND_LONG.
    assert ("int", 192) in [(c[0], c[1]) for c in copter.fake.commands]
    assert copter.fake.target is not None

    ack = await run(copter, "rtl")
    assert ack["st"] == "acked"
    assert copter.fake.mode in ("RTL", "LAND")


async def test_disarm_in_flight_needs_force(copter):
    await run(copter, "takeoff", alt=10)
    assert await wait_until(lambda: copter.fake.alt_rel > 2)
    ack = await run(copter, "disarm")
    assert ack["st"] == "failed"
    ack = await run(copter, "disarm", force=True)
    assert ack["st"] == "acked" and ack["res"] == {"force": True}
    assert not copter.fake.armed


async def test_hold_uses_brake_on_copter_and_hold_on_rover(copter, rover):
    assert (await run(copter, "hold"))["res"]["mode"] == "BRAKE"
    assert copter.fake.mode == "BRAKE"
    ack = await run(rover, "hold")
    assert ack["st"] == "acked" and rover.fake.mode == "HOLD"


async def test_rover_cannot_land_or_take_off(rover):
    assert (await run(rover, "land"))["code"] == "UNSUPPORTED"
    assert (await run(rover, "takeoff", alt=5))["code"] == "UNSUPPORTED"


async def test_reboot_refused_when_armed(copter):
    from vehicle_companion.mav.vehicle import is_armed

    await run(copter, "arm")
    assert await wait_until(lambda: is_armed(copter.conn.heartbeat()))
    ack = await run(copter, "reboot")
    assert ack["st"] == "failed" and ack["code"] == "ARMED"
    assert 246 not in [c[1] for c in copter.fake.commands]


@pytest.mark.parametrize("mtype", [MISSION, FENCE, RALLY])
async def test_upload_download_round_trip(copter, mtype):
    if mtype == MISSION:
        items = [home_item(), wp(1, 25.0331, 121.5655, cmd=22), wp(2, 25.0340, 121.5660), wp(3, 25.0345, 121.5670)]
    elif mtype == FENCE:
        # Inclusion polygon: param1 = vertex count; no home item.
        items = [dict(wp(i, lat, lon, alt=0, cmd=5001), p1=4) for i, (lat, lon) in enumerate(
            [(25.030, 121.560), (25.030, 121.570), (25.040, 121.570), (25.040, 121.560)])]
    else:
        items = [wp(0, 25.035, 121.565, alt=30, cmd=5100), wp(1, 25.036, 121.566, alt=30, cmd=5100)]

    up = await copter.missions.upload(items, mtype)
    assert up.ok, up.code
    assert len(copter.fake.missions[mtype]) == len(items)

    down = await copter.missions.download(mtype)
    assert down.ok, down.code
    assert [(i["cmd"], i["lat"], i["lon"]) for i in down.items] == [(i["cmd"], i["lat"], i["lon"]) for i in items]
    assert down.items[0]["p1"] == items[0]["p1"]


async def test_fence_upload_does_not_replace_the_mission(copter):
    mission = [home_item(), wp(1, 25.0331, 121.5655)]
    assert (await copter.missions.upload(mission, MISSION)).ok
    fence = [dict(wp(0, 25.03, 121.56, alt=0, cmd=5003), p1=150)]  # inclusion circle
    assert (await copter.missions.upload(fence, FENCE)).ok
    assert len(copter.fake.missions[MISSION]) == 2
    assert len(copter.fake.missions[FENCE]) == 1


async def test_upload_survives_lost_requests(copter):
    copter.fake.drop_mission_requests = 2
    items = [home_item(), wp(1, 25.0331, 121.5655), wp(2, 25.0332, 121.5656)]
    up = await copter.missions.upload(items)
    assert up.ok, up.code


async def test_rejected_upload_reports_mission_result(copter):
    copter.fake.upload_reject = 4  # MAV_MISSION_NO_SPACE
    up = await copter.missions.upload([home_item(), wp(1, 25.0, 121.0)])
    assert not up.ok and up.code == "MAV_MISSION_NO_SPACE"


async def test_mission_upload_command_fetches_from_source(copter):
    copter.handlers.mission_source.missions["m1"] = {"items": [home_item(), wp(1, 25.0331, 121.5655)]}
    ack = await run(copter, "mission_upload", missionId="m1")
    assert ack["st"] == "acked", ack
    ack = await run(copter, "mission_download")
    assert ack["st"] == "acked"
    assert copter.handlers.mission_source.downloads[-1][2] == MISSION


async def test_mission_start_and_set_current(copter):
    items = [home_item(), wp(1, 25.0331, 121.5655, alt=10, cmd=22), wp(2, 25.0340, 121.5660), wp(3, 25.0345, 121.5670)]
    assert (await copter.missions.upload(items)).ok
    await run(copter, "set_mode", mode="GUIDED")
    assert (await run(copter, "arm"))["st"] == "acked"
    ack = await run(copter, "mission_start")
    assert ack["st"] == "acked", ack
    assert copter.fake.mode == "AUTO"
    ack = await run(copter, "mission_set_current", seq=3)
    assert ack["st"] == "acked"
    assert copter.fake.mission_current == 3


async def test_params_get_set_float32_and_echo_index(copter):
    p = await copter.params.get("BATT_LOW_VOLT")
    assert p is not None and abs(p.value - 14.0) < 1e-6
    r = await copter.params.set("BATT_LOW_VOLT", 14.1)
    # 14.1 is not exactly representable; the float32 comparison must still match.
    assert r.ok, r.code
    ack = await run(copter, "param_set", params={"FENCE_ENABLE": 1, "NOPE_PARAM": 3})
    assert ack["st"] == "failed"
    assert ack["res"]["params"]["FENCE_ENABLE"]["ok"] is True
    assert ack["res"]["params"]["NOPE_PARAM"]["code"] == "PARAM_NOT_FOUND"
    ack = await run(copter, "param_get", names=["FENCE_ENABLE", "SYSID_MYGCS"])
    assert ack["res"]["params"] == {"FENCE_ENABLE": 1, "SYSID_MYGCS": 255}


async def test_fetch_all_recovers_dropped_params(copter):
    copter.fake.drop_param_indices = {1, 5, 9}
    table = await copter.params.fetch_all(idle_timeout=0.3)
    assert len(table) == len(copter.fake.params)
    assert "BATT_LOW_VOLT" in table


async def test_no_vehicle_is_reported():
    from vehicle_companion.clock import Clock
    from vehicle_companion.mav.command import CommandClient
    from vehicle_companion.mav.connection import MavConnection
    from vehicle_companion.mav.mission import MissionClient
    from vehicle_companion.mav.params import ParamClient
    from vehicle_companion.mav.statustext import StatusLog
    from vehicle_companion.ops.handlers import Handlers

    conn = MavConnection("udpin:127.0.0.1:0")
    clock = Clock()
    h = Handlers(conn, CommandClient(conn), MissionClient(conn), ParamClient(conn), StatusLog(clock.now_ms), clock.now_ms)
    ack = await h.run({"id": "x", "type": "arm", "args": {}})
    assert ack["code"] == "NO_VEHICLE"
    ack = await h.run({"id": "y", "type": "fly_to_moon", "args": {}})
    assert ack["code"] == "UNKNOWN_COMMAND"
