"""Replays real ArduPilot 4.7.1 SITL traffic, recorded by the companion
through mavlink-router (companion/sitl), and checks the state built from it.

The fake autopilot is what most tests run against; these recordings keep it
honest about what ArduPilot actually sends (message set, AUTOPILOT_VERSION
capability bits, SYS_STATUS sensor bits, EKF flags). Each file is the
companion's boot tlog: from its start through the first arming.
"""

import time
from pathlib import Path

import pytest

from vehicle_companion.mav.connection import MavConnection
from vehicle_companion.mav.proto import mavutil
from vehicle_companion.mav.statustext import StatusLog
from vehicle_companion.state import StateBuilder

FIXTURES = Path(__file__).parent / "fixtures" / "sitl"


def replay(name: str) -> dict:
    conn = MavConnection("udpin:127.0.0.1:0")  # never opened; fed from the file
    status = StatusLog(lambda: 0)
    log = mavutil.mavlink_connection(str(FIXTURES / name))
    try:
        while (msg := log.recv_match()) is not None:
            if msg.get_type() == "BAD_DATA":
                continue
            conn._on_message(msg, time.monotonic())
            if msg.get_type() == "STATUSTEXT":
                status.on_message(msg, 1)
    finally:
        log.close()
    return StateBuilder(conn, status, lambda: 0, battery_cells=3).build()


@pytest.mark.parametrize(
    "name, fw, cls, extra_caps",
    [
        ("arducopter-4.7.1-boot.tlog", "ArduCopter V4.7.1", "copter", []),
        ("ardurover-4.7.1-boot.tlog", "ArduRover V4.7.1", "rover", ["manual"]),
    ],
)
def test_state_from_real_ardupilot(name, fw, cls, extra_caps):
    s = replay(name)
    assert s["fc"]["ok"] and s["fc"]["id"] == [1, 1]
    assert s["fw"] == fw
    assert s["veh"]["cls"] == cls and s["veh"]["ap"] == "ardupilot"
    # SITL reports the fence/rally/COMMAND_INT capability bits.
    assert s["caps"] == ["mission", "params", "fence", "rally", "command_int", *extra_caps]
    assert s["gps"]["fix"] >= 3 and s["gps"]["sats"] >= 6
    assert s["pos"]["lat"] == pytest.approx(24.1477, abs=1e-4) and s["pos"]["lon"] == pytest.approx(120.6736, abs=1e-4)
    # 3S pack from SYS_STATUS / BATTERY_STATUS; an analog monitor, so an average.
    assert s["bat"]["v"] == pytest.approx(12.6, abs=0.1) and s["bat"]["cellAvg"] is True
    assert s["ekf"] is not None and s["ekf"]["worst"] < 0.5
    assert s["health"]["prearm"] is True and s["health"]["bad"] == []
    # The recording ends just after arming in GUIDED.
    assert s["armed"] is True and s["mode"] == "GUIDED"
