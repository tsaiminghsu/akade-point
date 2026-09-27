import asyncio
import time

from vehicle_companion.clock import Clock
from vehicle_companion.ops.executor import Executor, lane_of


class FakeHandlers:
    def __init__(self, delays=None):
        self.delays = delays or {}
        self.ran: list[str] = []
        self.started: list[str] = []

    def ack(self, cmd_id, ok, code, msg="", res=None):
        return {"v": 1, "id": cmd_id, "st": "acked" if ok else "failed", "code": code, "t": 0, **({"msg": msg} if msg else {})}

    async def run(self, cmd):
        self.started.append(cmd["id"])
        await asyncio.sleep(self.delays.get(cmd["type"], 0))
        self.ran.append(cmd["id"])
        return self.ack(cmd["id"], True, "OK")


def make(delays=None, synced=False):
    acks: list[dict] = []
    clock = Clock()
    if synced:
        clock.update(time.time() * 1000, time.time() * 1000, time.time() * 1000)
    h = FakeHandlers(delays)
    ex = Executor(h, acks.append, clock)
    return ex, h, acks


async def settle(ex, acks, n, timeout=3.0):
    for _ in range(int(timeout / 0.01)):
        if len(acks) >= n:
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"expected {n} acks, got {acks}")


def test_lanes():
    assert lane_of("rtl") == "priority"
    assert lane_of("disarm") == "priority"
    assert lane_of("mission_upload") == "slow"
    assert lane_of("goto") == "fast"


async def test_duplicate_runs_once_and_resends_the_ack():
    ex, h, acks = make()
    runner = asyncio.create_task(ex.run())
    cmd = {"id": "a", "type": "arm", "args": {}}
    ex.submit(cmd)
    ex.submit(cmd)  # still running: ignored
    await settle(ex, acks, 1)
    ex.submit(cmd)  # finished: the stored ack goes out again (the first POST may have been lost)
    await settle(ex, acks, 2)
    assert h.ran == ["a"]
    assert acks[0] == acks[1]
    runner.cancel()


async def test_expired_command_is_refused_once_clock_is_synced():
    ex, h, acks = make(synced=True)
    runner = asyncio.create_task(ex.run())
    old = int(time.time() * 1000) - 60_000
    ex.submit({"id": "g", "type": "goto", "args": {}, "iat": old, "to": 10_000})
    ex.submit({"id": "h", "type": "goto", "args": {}, "exp": int(time.time() * 1000) + 10_000})
    await settle(ex, acks, 2)
    assert {a["id"]: a["code"] for a in acks} == {"g": "EXPIRED", "h": "OK"}
    assert h.ran == ["h"]
    runner.cancel()


async def test_expiry_not_enforced_before_clock_sync():
    ex, h, acks = make(synced=False)
    runner = asyncio.create_task(ex.run())
    ex.submit({"id": "g", "type": "goto", "args": {}, "iat": 0, "to": 10_000})
    await settle(ex, acks, 1)
    assert acks[0]["code"] == "OK"
    runner.cancel()


async def test_safety_command_preempts_running_and_queued_commands():
    ex, h, acks = make({"goto": 5.0, "takeoff": 5.0})
    runner = asyncio.create_task(ex.run())
    ex.submit({"id": "slowgoto", "type": "goto", "args": {}})
    ex.submit({"id": "queued", "type": "takeoff", "args": {}})
    await asyncio.sleep(0.05)
    assert h.started == ["slowgoto"]
    ex.submit({"id": "rtl", "type": "rtl", "args": {}})
    await settle(ex, acks, 3)
    codes = {a["id"]: a["code"] for a in acks}
    assert codes == {"slowgoto": "PREEMPTED", "queued": "PREEMPTED", "rtl": "OK"}
    assert "queued" not in h.started
    runner.cancel()


async def test_slow_lane_does_not_block_safety_or_fast_commands():
    ex, h, acks = make({"mission_upload": 5.0})
    runner = asyncio.create_task(ex.run())
    ex.submit({"id": "up", "type": "mission_upload", "args": {}})
    ex.submit({"id": "mode", "type": "set_mode", "args": {}})
    ex.submit({"id": "stop", "type": "disarm", "args": {}})
    await settle(ex, acks, 2, timeout=1.0)
    assert {a["id"] for a in acks} == {"mode", "stop"}
    runner.cancel()


async def test_handler_timeout_becomes_a_timeout_ack():
    ex, h, acks = make({"goto": 5.0})
    runner = asyncio.create_task(ex.run())
    import vehicle_companion.ops.executor as mod

    mod.TYPE_TIMEOUT_S["goto"] = 0.1
    try:
        ex.submit({"id": "g", "type": "goto", "args": {}})
        await settle(ex, acks, 1)
        assert acks[0]["code"] == "TIMEOUT"
    finally:
        del mod.TYPE_TIMEOUT_S["goto"]
        runner.cancel()


async def test_malformed_commands_are_ignored():
    ex, h, acks = make()
    ex.submit({"type": "arm"})
    ex.submit({"id": "x"})
    assert acks == [] and h.started == []
