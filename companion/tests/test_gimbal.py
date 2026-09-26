import asyncio
import math

from vehicle_companion.ops.executor import lane_of
from vehicle_companion.ops.gimbal import GimbalControl, GimbalStreamer, clamp_pitch, quat_to_euler_deg, wrap_yaw
from vehicle_companion.state import StateBuilder


async def run(rig, ctype, **args):
    return await rig.handlers.run({"id": f"g-{ctype}", "type": ctype, "args": args})


def test_angle_helpers():
    assert clamp_pitch(-120) == -90 and clamp_pitch(45) == 30
    assert wrap_yaw(190) == -170 and wrap_yaw(-190) == 170 and wrap_yaw(180) == 180
    # The fake gimbal's quaternion for pitch -30°, yaw 40°.
    p, y = math.radians(-30), math.radians(40)
    q = [math.cos(y / 2) * math.cos(p / 2), -math.sin(y / 2) * math.sin(p / 2), math.cos(y / 2) * math.sin(p / 2), math.sin(y / 2) * math.cos(p / 2)]
    r, pitch, yaw = quat_to_euler_deg(q)
    assert abs(r) < 1e-6 and abs(pitch + 30) < 1e-6 and abs(yaw - 40) < 1e-6
    assert lane_of("gimbal_pitchyaw") == "gimbal" and lane_of("roi_location") == "gimbal"


async def test_gimbal_commands_reach_the_autopilot(copter):
    copter.handlers.gimbal = GimbalControl(copter.conn, copter.commands)
    ack = await run(copter, "gimbal_pitchyaw", pitch=-45, yaw=20, lock=True)
    assert ack["st"] == "acked", ack
    assert copter.fake.gimbal["pitch"] == -45 and copter.fake.gimbal["yaw"] == 20
    sent = [c for c in copter.fake.commands if c[1] == 1000][-1]
    assert sent[2][4] == 16  # yaw-lock flag

    assert (await run(copter, "gimbal_mode", mode="retract"))["st"] == "acked"
    assert copter.fake.gimbal["mode"] == 0
    assert (await run(copter, "gimbal_mode", mode="sideways"))["code"] == "BAD_ARGS"

    ack = await run(copter, "roi_location", lat=25.034, lon=121.566, alt=0)
    assert ack["st"] == "acked"
    assert ("int", 195) in [(c[0], c[1]) for c in copter.fake.commands]
    assert copter.fake.gimbal["roi"][0] == 25.034
    assert (await run(copter, "roi_none"))["st"] == "acked" and copter.fake.gimbal["roi"] is None


async def test_state_reports_gimbal_attitude_and_capability(copter):
    copter.handlers.gimbal = GimbalControl(copter.conn, copter.commands)
    await run(copter, "gimbal_pitchyaw", pitch=-60, yaw=0)
    for _ in range(60):
        s = StateBuilder(copter.conn, copter.status, copter.clock.now_ms).build()
        if s["mount"] and abs(s["mount"]["p"] + 60) < 0.5:
            break
        await asyncio.sleep(0.05)
    assert s["mount"]["src"] == "device" and abs(s["mount"]["p"] + 60) < 0.5
    assert "gimbal" in s["caps"]


async def test_streamer_sends_at_most_ten_per_second_and_keeps_the_latest(copter):
    streamer = GimbalStreamer(copter.conn)
    for i in range(40):
        streamer.update(-i, 0)
        await asyncio.sleep(0.0125)  # 80 Hz of input for 0.5 s
    await asyncio.sleep(0.25)
    assert 4 <= streamer.sent <= 7
    assert copter.fake.gimbal["pitch"] == -39
