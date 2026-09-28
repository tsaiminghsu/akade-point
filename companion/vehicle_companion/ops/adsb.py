"""ADS-B traffic: ADSB_VEHICLE from the autopilot (ArduPilot forwards what its
ADS-B receiver hears, ADSB_TYPE) or from any other component, e.g. a pingRX
on the companion's router.

Aircraft are kept for a while after their last report and put in the state
nearest first, with the distance and height difference to our vehicle; the
ground station decides what counts as a threat.
"""

from __future__ import annotations

import math
import time
from typing import Callable, Optional

from ..mav.connection import MavConnection

# Drop an aircraft this long after its last report.
STALE_S = 20.0
# The state carries at most this many, nearest first.
MAX_IN_STATE = 20
EARTH_R = 6_371_000.0

# ADSB_VEHICLE flags
FLAG_COORDS = 1
FLAG_ALTITUDE = 2
FLAG_HEADING = 4
FLAG_VELOCITY = 8
FLAG_CALLSIGN = 16
FLAG_VERTICAL_VELOCITY = 128


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(min(1.0, math.sqrt(a)))


class AdsbTracker:
    def __init__(self, conn: MavConnection, clock: Callable[[], float] = time.monotonic):
        self.conn = conn
        self.clock = clock
        # ICAO address -> (report dict, monotonic time)
        self.aircraft: dict[int, tuple[dict, float]] = {}

    def on_adsb(self, msg) -> None:
        flags = int(msg.flags)
        if not flags & FLAG_COORDS or (msg.lat == 0 and msg.lon == 0):
            return
        cs = msg.callsign.decode("ascii", "replace") if isinstance(msg.callsign, bytes) else str(msg.callsign)
        self.aircraft[int(msg.ICAO_address)] = (
            {
                "icao": f"{int(msg.ICAO_address):06X}",
                "cs": cs.rstrip("\x00 ") or None if flags & FLAG_CALLSIGN else None,
                "lat": round(msg.lat / 1e7, 6),
                "lon": round(msg.lon / 1e7, 6),
                # mm; pressure (QNH) or geometric altitude, both treated as AMSL
                "alt": round(msg.altitude / 1000.0) if flags & FLAG_ALTITUDE else None,
                "hdg": round(msg.heading / 100.0) if flags & FLAG_HEADING else None,
                "spd": round(msg.hor_velocity / 100.0, 1) if flags & FLAG_VELOCITY else None,
                "vs": round(msg.ver_velocity / 100.0, 1) if flags & FLAG_VERTICAL_VELOCITY else None,
                "emitter": int(msg.emitter_type),
                "squawk": int(msg.squawk),
            },
            self.clock(),
        )

    def state_block(self) -> Optional[list[dict]]:
        now = self.clock()
        for icao in [k for k, (_, t) in self.aircraft.items() if now - t > STALE_S]:
            del self.aircraft[icao]
        if not self.aircraft:
            return None
        gpi = self.conn.latest("GLOBAL_POSITION_INT", max_age=3.0)
        own = None if gpi is None or (gpi.lat == 0 and gpi.lon == 0) else (gpi.lat / 1e7, gpi.lon / 1e7, gpi.alt / 1000.0)
        out = []
        for report, t in self.aircraft.values():
            row = dict(report, age=round(now - t, 1))
            if own is not None:
                row["d"] = round(distance_m(own[0], own[1], report["lat"], report["lon"]))
                row["dz"] = None if report["alt"] is None else round(report["alt"] - own[2])
            else:
                row["d"] = row["dz"] = None
            out.append(row)
        out.sort(key=lambda r: (r["d"] is None, r["d"] or 0))
        return out[:MAX_IN_STATE]
