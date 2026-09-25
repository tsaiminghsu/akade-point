"""Command executor tests against a fake MavlinkLink — no pymavlink, no FC."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vehicle_companion.commands import CommandExecutor, MAV_RESULT_ACCEPTED


class FakeLink:
    def __init__(self, mode_ok=True, arm_result=MAV_RESULT_ACCEPTED, cmd_result=MAV_RESULT_ACCEPTED):
        self.mode_ok = mode_ok
        self.arm_result = arm_result
        self.cmd_result = cmd_result
        self.modes_set = []
        self.commands = []

    def set_mode(self, name):
        self.modes_set.append(name)
        return self.mode_ok

    def command_long(self, command, *params, timeout=10):
        self.commands.append((command, params))
        # 400 == ARM/DISARM
        if command == 400:
            return self.arm_result
        return self.cmd_result


class FakeApi:
    def __init__(self, mission=None):
        self.mission = mission
        self.acks = []
        self.downloads = []

    def post_ack(self, cmd_id, ack):
        self.acks.append((cmd_id, ack))
        return True

    def get_mission(self, mission_id):
        return self.mission

    def post_mission_download(self, cmd_id, items):
        self.downloads.append((cmd_id, items))
        return True


def make(link=None, api=None):
    return CommandExecutor(link or FakeLink(), api or FakeApi(), config=None)


def test_arm_success():
    ex = make()
    ack = ex.execute({"id": "c1", "type": "arm", "args": {}})
    assert ack["st"] == "acked"
    assert ack["code"] == "MAV_RESULT_ACCEPTED"


def test_arm_failure_maps_result_code():
    ex = make(link=FakeLink(arm_result=4))
    ack = ex.execute({"id": "c1", "type": "arm", "args": {}})
    assert ack["st"] == "failed"
    assert ack["code"] == "MAV_RESULT_FAILED"


def test_timeout_maps_to_timeout_code():
    ex = make(link=FakeLink(arm_result=None))
    ack = ex.execute({"id": "c1", "type": "arm", "args": {}})
    assert ack["st"] == "failed"
    assert ack["code"] == "TIMEOUT"


def test_dedupe_returns_without_reexecuting():
    link = FakeLink()
    ex = make(link=link)
    ex.execute({"id": "dup", "type": "arm", "args": {}})
    n = len(link.commands)
    ack = ex.execute({"id": "dup", "type": "arm", "args": {}})
    assert ack["code"] == "DUPLICATE_IGNORED"
    assert len(link.commands) == n  # not re-run


def test_takeoff_requires_guided_and_arm():
    link = FakeLink()
    ex = make(link=link)
    ack = ex.execute({"id": "c1", "type": "takeoff", "args": {"alt": 10}})
    assert ack["st"] == "acked"
    assert "GUIDED" in link.modes_set
    assert ack["res"]["alt"] == 10


def test_takeoff_fails_if_mode_rejected():
    ex = make(link=FakeLink(mode_ok=False))
    ack = ex.execute({"id": "c1", "type": "takeoff", "args": {"alt": 10}})
    assert ack["st"] == "failed"
    assert ack["code"] == "MODE_REJECTED"


def test_ack_is_posted():
    api = FakeApi()
    ex = make(api=api)
    ex.execute({"id": "c1", "type": "arm", "args": {}})
    assert api.acks and api.acks[0][0] == "c1"


def test_unknown_command():
    ex = make()
    ack = ex.execute({"id": "c1", "type": "explode", "args": {}})
    assert ack["st"] == "failed"
    assert ack["code"] == "UNKNOWN_COMMAND"
