import asyncio
from types import SimpleNamespace

from vehicle_companion.clock import Clock
from vehicle_companion.mav.connection import MavConnection
from vehicle_companion.mav.statustext import StatusLog
from vehicle_companion.state import StateBuilder, battery_block, prearm_ok, to_v1, unhealthy_sensors


def sys_status(mv=16000, ca=1200, pct=80):
    return SimpleNamespace(voltage_battery=mv, current_battery=ca, battery_remaining=pct)


def battery_status(voltages, remaining=75, mah=500):
    return SimpleNamespace(voltages=voltages + [65535] * (10 - len(voltages)), voltages_ext=[0, 0, 0, 0],
                           battery_remaining=remaining, current_consumed=mah)


def test_battery_unknown_values_are_none_not_zero():
    b = battery_block(sys_status(mv=65535, ca=-1, pct=-1), None, 4)
    assert b["v"] is None and b["a"] is None and b["pct"] is None and b["cellV"] is None
    # 0 V is never a real reading either.
    assert battery_block(sys_status(mv=0), None, 4)["v"] is None


def test_analog_monitor_gives_average_cell_voltage():
    b = battery_block(sys_status(mv=15200), battery_status([15200]), 4)
    assert b["cells"] == 4 and b["cellV"] == 3.8 and b["cellAvg"] is True


def test_smart_battery_gives_lowest_cell():
    b = battery_block(sys_status(mv=65535), battery_status([4100, 4050, 3990, 4080]), 0)
    assert b["cells"] == 4 and b["cellV"] == 3.99 and b["cellAvg"] is False
    assert b["v"] == 16.22


def test_sensor_health_and_prearm():
    present = enabled = 1 | 2 | 32 | 268435456
    assert unhealthy_sensors(present, enabled, present & ~32) == ["gps"]
    assert prearm_ok(present, enabled, present) is True
    assert prearm_ok(present, enabled, present & ~268435456) is False
    assert prearm_ok(1, 1, 1) is None


def test_no_flight_controller_means_nulls():
    clock = Clock()
    conn = MavConnection("udpin:127.0.0.1:0")
    s = StateBuilder(conn, StatusLog(clock.now_ms), clock.now_ms).build()
    assert s["fc"]["ok"] is False
    for key in ("armed", "mode", "att", "bat", "gps", "pos", "hdg", "gs", "wp", "ekf", "vibe", "fw"):
        assert s[key] is None, key
    v1 = to_v1(s)
    assert v1["mode"] == "UNKNOWN" and v1["bat"]["v"] == 0 and v1["fw"] == "unknown"


async def test_state_from_live_autopilot(copter):
    b = StateBuilder(copter.conn, copter.status, copter.clock.now_ms, battery_cells=4)
    # Ask for the slower groups too, as StreamManager would.
    for name in ("EKF_STATUS_REPORT", "VIBRATION", "HOME_POSITION", "NAV_CONTROLLER_OUTPUT", "AUTOPILOT_VERSION"):
        from vehicle_companion.mav.streams import msg_id

        await copter.commands.command_long(512, [msg_id(name)])
    await asyncio.sleep(0.3)
    s = b.build()
    assert s["v"] == 2
    assert s["fc"]["ok"] is True and s["fc"]["id"] == [1, 1]
    assert s["veh"] == {"cls": "copter", "ap": "ardupilot", "mavType": 2}
    assert s["armed"] is False and s["mode"] == "STABILIZE"
    assert s["pos"]["lat"] == 25.033
    assert s["home"] is not None
    assert s["bat"]["cells"] == 4 and s["bat"]["cellAvg"] is True
    assert s["gps"]["fix"] == 3 and s["gps"]["sats"] == 14
    assert s["att"] is not None
    assert s["ekf"]["worst"] < 0.5
    assert s["fw"] == "ArduCopter V4.5.7"
    assert {"mission", "params", "fence", "rally", "command_int"} <= set(s["caps"])
    assert s["health"]["prearm"] is True
    v1 = to_v1(s)
    assert v1["v"] == 1 and v1["pos"]["lat"] == 25.033


async def test_rover_caps_include_manual(rover):
    s = StateBuilder(rover.conn, rover.status, rover.clock.now_ms).build()
    assert s["veh"]["cls"] == "rover" and "manual" in s["caps"]
    assert s["mode"] == "MANUAL"


def test_statustext_prearm_window_and_chunks():
    from vehicle_companion.mav.proto import mavlink

    status = StatusLog(lambda: 1)
    enc = mavlink.MAVLink(None, srcSystem=1, srcComponent=1)
    parser = mavlink.MAVLink(None)

    def feed(text, chunk_id=0):
        msg = enc.statustext_encode(2, text.encode(), chunk_id, 0)
        status.on_message(parser.parse_buffer(msg.pack(enc))[0])

    feed("PreArm: GPS not healthy")
    feed("PreArm: Compass not calibrated")
    feed("PreArm: GPS not healthy")  # repeated: listed once
    assert status.prearm_failures() == ["PreArm: Compass not calibrated", "PreArm: GPS not healthy"]
    status.clear_prearm()
    assert status.prearm_failures() == []
    feed("A" * 50, chunk_id=7)
    feed("tail", chunk_id=7)
    assert status.entries[-1]["text"] == "A" * 50 + "tail"
    out = status.take_outbox()
    assert len(out) == 4 and status.take_outbox() == []
