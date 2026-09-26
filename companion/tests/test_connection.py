import asyncio

from vehicle_companion.mav.connection import MavConnection
from vehicle_companion.mav.proto import mavlink

from conftest import make_rig


def _decoded(enc, msg):
    parser = mavlink.MAVLink(None)
    return parser.parse_buffer(msg.pack(enc))[0]


def _hb(sysid, compid, mav_type, autopilot=mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA):
    enc = mavlink.MAVLink(None, srcSystem=sysid, srcComponent=compid)
    return _decoded(enc, enc.heartbeat_encode(mav_type, autopilot, 81, 0, mavlink.MAV_STATE_STANDBY))


def test_pins_autopilot_not_gimbal_or_gcs():
    conn = MavConnection("udpin:127.0.0.1:0")
    # Mission Planner and the gimbal speak first, as can happen behind mavlink-router.
    conn._on_message(_hb(255, 190, mavlink.MAV_TYPE_GCS, mavlink.MAV_AUTOPILOT_INVALID), 0.0)
    conn._on_message(_hb(1, 154, mavlink.MAV_TYPE_GIMBAL, mavlink.MAV_AUTOPILOT_INVALID), 0.0)
    conn._on_message(_hb(1, 25, mavlink.MAV_TYPE_ONBOARD_CONTROLLER, mavlink.MAV_AUTOPILOT_INVALID), 0.0)
    assert conn.target is None
    conn._on_message(_hb(1, 1, mavlink.MAV_TYPE_QUADROTOR), 0.0)
    assert conn.target == (1, 1)
    # A second vehicle does not steal the pin while the first is alive.
    conn._on_message(_hb(2, 1, mavlink.MAV_TYPE_GROUND_ROVER), 0.1)
    assert conn.target == (1, 1)


def test_prefers_component_1_of_the_same_system():
    conn = MavConnection("udpin:127.0.0.1:0")
    conn._on_message(_hb(1, 2, mavlink.MAV_TYPE_QUADROTOR), 0.0)
    assert conn.target == (1, 2)
    conn._on_message(_hb(1, 1, mavlink.MAV_TYPE_QUADROTOR), 0.1)
    assert conn.target == (1, 1)


def test_configured_target_system_is_respected():
    conn = MavConnection("udpin:127.0.0.1:0", target_system=7)
    conn._on_message(_hb(1, 1, mavlink.MAV_TYPE_QUADROTOR), 0.0)
    assert conn.target is None
    conn._on_message(_hb(7, 1, mavlink.MAV_TYPE_GROUND_ROVER), 0.0)
    assert conn.target == (7, 1)


def test_esp32_rover_base_counts_as_a_vehicle():
    conn = MavConnection("udpin:127.0.0.1:0")
    conn._on_message(_hb(3, 1, mavlink.MAV_TYPE_GROUND_ROVER, mavlink.MAV_AUTOPILOT_GENERIC), 0.0)
    assert conn.target == (3, 1)


async def test_mavlink2_on_the_wire(copter):
    hb = copter.conn.heartbeat()
    assert hb is not None
    # 0xFD is the MAVLink2 start byte (MAVLink1 is 0xFE); mission_type and
    # other extension fields only exist in MAVLink2 frames.
    assert hb.get_msgbuf()[0] == 0xFD
    out = copter.conn.mav.heartbeat_encode(6, 8, 0, 0, 4)
    assert out.pack(copter.conn.mav)[0] == 0xFD


async def test_other_gcs_is_reported():
    rig = await make_rig("copter")
    try:
        rig.fake.inject_gcs_heartbeat = True
        for _ in range(100):
            if rig.conn.other_gcs():
                break
            await asyncio.sleep(0.05)
        assert rig.conn.other_gcs() == [(255, 190)]
        assert rig.conn.target == (1, 1)
    finally:
        rig.fake.stop()
        rig.conn.stop()


async def test_foreign_ack_is_not_taken_for_ours(copter):
    # Mission Planner's ack for the same command arrives first; we must wait for ours.
    copter.fake.foreign_ack_first = True
    r = await copter.commands.command_long(400, [1, 0])
    assert r.ok, r.code


async def test_lost_command_is_retransmitted_with_confirmation(copter):
    copter.fake.drop_commands = 1
    r = await copter.commands.command_long(401, [], attempt_timeout=0.4)
    assert r.ok
    sent = [c for c in copter.fake.commands if c[1] == 401]
    assert [c[3] for c in sent] == [0, 1]


async def test_concurrent_commands_each_get_their_own_ack(copter):
    # The old design had two readers racing for COMMAND_ACK; now every waiter
    # sees every ack.
    results = await asyncio.gather(
        copter.commands.command_long(401),
        copter.commands.command_long(512, [mavlink.MAVLINK_MSG_ID_HOME_POSITION]),
        copter.commands.command_long(511, [mavlink.MAVLINK_MSG_ID_VIBRATION, 200000]),
    )
    assert all(r.ok for r in results), [r.code for r in results]
