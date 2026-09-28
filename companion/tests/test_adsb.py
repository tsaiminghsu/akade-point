import asyncio
from types import SimpleNamespace

from vehicle_companion.ops.adsb import STALE_S, AdsbTracker, distance_m
from vehicle_companion.state import StateBuilder

from conftest import make_rig


def adsb(icao, lat, lon, alt_m, flags=1 | 2 | 4 | 8 | 16, cs=b"TEST1\x00\x00\x00\x00"):
    return SimpleNamespace(ICAO_address=icao, lat=int(lat * 1e7), lon=int(lon * 1e7), altitude=int(alt_m * 1000), heading=9000,
                           hor_velocity=5000, ver_velocity=0, callsign=cs, emitter_type=1, flags=flags, squawk=1200)


class NoPosition:
    def latest(self, *_a, **_k):
        return None


def test_distance_is_haversine():
    # 0.01° of latitude is about 1112 m.
    assert abs(distance_m(24.0, 120.0, 24.01, 120.0) - 1112) < 2


def test_tracker_keeps_one_row_per_aircraft_and_expires_them():
    now = [100.0]
    tr = AdsbTracker(NoPosition(), clock=lambda: now[0])
    tr.on_adsb(adsb(0xABC, 24.1, 120.6, 900))
    tr.on_adsb(adsb(0xABC, 24.11, 120.6, 950))
    tr.on_adsb(adsb(0xDEF, 24.2, 120.6, 1500, flags=1))  # position only
    rows = tr.state_block()
    assert len(rows) == 2
    abc = next(r for r in rows if r["icao"] == "000ABC")
    assert abc["lat"] == 24.11 and abc["alt"] == 950 and abc["cs"] == "TEST1" and abc["hdg"] == 90 and abc["spd"] == 50.0
    assert abc["d"] is None and abc["dz"] is None  # our own position unknown
    other = next(r for r in rows if r["icao"] == "000DEF")
    assert other["alt"] is None and other["cs"] is None and other["spd"] is None
    now[0] += STALE_S + 1
    assert tr.state_block() is None


def test_reports_without_coordinates_are_ignored():
    tr = AdsbTracker(NoPosition())
    tr.on_adsb(adsb(1, 24.1, 120.6, 500, flags=2))
    tr.on_adsb(adsb(2, 0, 0, 500))
    assert tr.state_block() is None


async def test_traffic_from_the_autopilot_nearest_first():
    rig = await make_rig("copter", adsb=True)
    try:
        tr = AdsbTracker(rig.conn)
        rig.conn.add_listener("ADSB_VEHICLE", tr.on_adsb)
        for _ in range(80):
            rows = tr.state_block()
            if rows and len(rows) == 3 and rows[0]["d"] is not None:
                break
            await asyncio.sleep(0.05)
        rows = tr.state_block()
        assert [r["cs"] for r in rows] == ["N0NEAR", "CAL123", "EVA456"]
        near = rows[0]
        assert 200 < near["d"] < 300 and 40 < near["dz"] < 80
        s = StateBuilder(rig.conn, rig.status, rig.clock.now_ms, adsb_state=tr.state_block).build()
        assert s["adsb"][0]["icao"] == "899003"
    finally:
        rig.fake.stop()
        rig.conn.stop()
