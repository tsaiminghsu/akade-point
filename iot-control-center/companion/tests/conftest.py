import os

# Before anything imports pymavlink (see vehicle_companion/mav/proto.py).
os.environ["MAVLINK20"] = "1"

import socket  # noqa: E402
from dataclasses import dataclass  # noqa: E402

import pytest  # noqa: E402

from vehicle_companion.clock import Clock  # noqa: E402
from vehicle_companion.mav.command import CommandClient  # noqa: E402
from vehicle_companion.mav.connection import MavConnection  # noqa: E402
from vehicle_companion.mav.mission import MissionClient  # noqa: E402
from vehicle_companion.mav.params import ParamClient  # noqa: E402
from vehicle_companion.mav.proto import mavlink  # noqa: E402
from vehicle_companion.mav.statustext import StatusLog  # noqa: E402
from vehicle_companion.ops.handlers import Handlers  # noqa: E402
from vehicle_companion.tools.fake_autopilot import FakeAutopilot  # noqa: E402


def free_udp_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@dataclass
class Rig:
    fake: FakeAutopilot
    conn: MavConnection
    commands: CommandClient
    missions: MissionClient
    params: ParamClient
    status: StatusLog
    clock: Clock
    handlers: Handlers


class MemoryMissionSource:
    def __init__(self):
        self.missions: dict[str, dict] = {}
        self.downloads: list[tuple[str, list, int]] = []

    async def get_mission(self, mission_id):
        return self.missions.get(mission_id)

    async def post_mission_download(self, command_id, items, mission_type):
        self.downloads.append((command_id, items, mission_type))
        return True

    async def post_params(self, command_id, params, fw):
        self.params = (command_id, params, fw)
        return True


async def make_rig(vehicle: str = "copter", **fake_kwargs) -> Rig:
    import asyncio

    port = free_udp_port()
    conn = MavConnection(f"udpin:127.0.0.1:{port}")
    conn.start(asyncio.get_running_loop())
    fake = FakeAutopilot(("127.0.0.1", port), vehicle=vehicle, tick_s=0.005, speedup=fake_kwargs.pop("speedup", 20.0), **fake_kwargs)
    fake.start()
    clock = Clock()
    status = StatusLog(clock.now_ms)
    conn.add_listener("STATUSTEXT", lambda m: status.on_message(m))
    commands = CommandClient(conn)
    missions = MissionClient(conn, item_timeout=0.5, retries=6)
    params = ParamClient(conn, timeout=0.5)
    handlers = Handlers(conn, commands, missions, params, status, clock.now_ms, mission_source=MemoryMissionSource(), mode_confirm_s=3.0)
    assert await conn.wait_target(5.0) is not None, "fake autopilot heartbeat not received"
    # A HEARTBEAT has arrived; wait for the fast streams too.
    for _ in range(100):
        if conn.latest("GLOBAL_POSITION_INT") is not None:
            break
        await asyncio.sleep(0.02)
    return Rig(fake, conn, commands, missions, params, status, clock, handlers)


@pytest.fixture
async def copter():
    rig = await make_rig("copter")
    yield rig
    rig.fake.stop()
    rig.conn.stop()


@pytest.fixture
async def rover():
    rig = await make_rig("rover")
    yield rig
    rig.fake.stop()
    rig.conn.stop()


__all__ = ["Rig", "make_rig", "mavlink", "MemoryMissionSource"]
