from types import SimpleNamespace

from vehicle_companion.mav.proto import mavlink
from vehicle_companion.tlog import TlogWriter

ARMED = SimpleNamespace(base_mode=mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
DISARMED = SimpleNamespace(base_mode=0)


def test_a_flight_is_one_file_closed_at_disarm(tmp_path):
    w = TlogWriter(tmp_path)
    w.on_heartbeat(DISARMED)
    w.write(b"boot")
    w.on_heartbeat(ARMED)
    flight = w.path
    assert "-flight" in flight.name
    w.write(b"airborne")
    w.on_heartbeat(ARMED)  # still the same flight
    assert w.path == flight
    w.on_heartbeat(DISARMED)
    assert "-ground" in w.path.name
    w.close()
    files = {f["name"]: f for f in w.list_files()}
    assert not files[flight.name]["active"]  # closed, so the uploader may send it
    assert flight.read_bytes().endswith(b"airborne")
