"""Mission upload/download tests driving a fake link's message sequence."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vehicle_companion import mission


class Msg:
    def __init__(self, mtype, **fields):
        self._type = mtype
        self.__dict__.update(fields)

    def get_type(self):
        return self._type


class FakeMav:
    def __init__(self):
        self.sent_items = []
        self.counts = []

    def mission_count_send(self, sys, comp, count):
        self.counts.append(count)

    def mission_item_int_send(self, sys, comp, seq, frame, cmd, cur, ac, p1, p2, p3, p4, lat, lon, alt):
        self.sent_items.append({"seq": seq, "cmd": cmd, "lat": lat, "lon": lon, "alt": alt})

    def mission_request_list_send(self, sys, comp):
        pass

    def mission_request_int_send(self, sys, comp, seq):
        pass

    def mission_ack_send(self, sys, comp, result):
        pass


class FakeMaster:
    def __init__(self, script):
        self.mav = FakeMav()
        self.target_system = 1
        self.target_component = 1
        self._script = list(script)

    def recv_match(self, type=None, blocking=False, timeout=0.0):
        if not self._script:
            return None
        return self._script.pop(0)


class FakeLink:
    def __init__(self, script):
        self.master = FakeMaster(script)


def test_upload_sends_each_requested_item_then_succeeds():
    items = [
        {"seq": 0, "cur": 1, "frame": 0, "cmd": 16, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "lat": 1.0, "lon": 2.0, "alt": 0, "ac": 1},
        {"seq": 1, "cur": 0, "frame": 3, "cmd": 22, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "lat": 0.0, "lon": 0.0, "alt": 10, "ac": 1},
    ]
    script = [
        Msg("MISSION_REQUEST_INT", seq=0),
        Msg("MISSION_REQUEST_INT", seq=1),
        Msg("MISSION_ACK", type=0),
    ]
    link = FakeLink(script)
    assert mission.upload(link, items) is True
    assert link.master.mav.counts == [2]
    assert len(link.master.mav.sent_items) == 2
    # lat/lon converted to 1e7 ints
    assert link.master.mav.sent_items[0]["lat"] == 10000000


def test_upload_fails_on_rejected_ack():
    items = [{"seq": 0, "cur": 1, "frame": 0, "cmd": 16, "p1": 0, "p2": 0, "p3": 0, "p4": 0, "lat": 0, "lon": 0, "alt": 0, "ac": 1}]
    link = FakeLink([Msg("MISSION_ACK", type=1)])
    assert mission.upload(link, items) is False


def test_download_reads_count_then_items():
    script = [
        Msg("MISSION_COUNT", count=2),
        Msg("MISSION_ITEM_INT", seq=0, current=1, frame=0, command=16, param1=0, param2=0, param3=0, param4=0, x=10000000, y=20000000, z=0, autocontinue=1),
        Msg("MISSION_ITEM_INT", seq=1, current=0, frame=3, command=22, param1=0, param2=0, param3=0, param4=0, x=0, y=0, z=10, autocontinue=1),
    ]
    link = FakeLink(script)
    items = mission.download(link)
    assert len(items) == 2
    assert items[0]["lat"] == 1.0 and items[0]["lon"] == 2.0
    assert items[1]["cmd"] == 22 and items[1]["alt"] == 10
