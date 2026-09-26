"""The one place pymavlink is imported.

MAVLink2 has to be chosen before `mavutil` is first imported: pymavlink picks
its dialect module from the MAVLINK20 environment variable at import time and
otherwise speaks MAVLink1. MAVLink1 silently drops the extension fields we
depend on — `mission_type` above all, so a fence upload would arrive as a
normal mission and overwrite it. Import `mavutil`/`mavlink` from here, never
from pymavlink directly.
"""

from __future__ import annotations

import os

os.environ.setdefault("MAVLINK20", "1")

from pymavlink import mavutil  # noqa: E402

mavlink = mavutil.mavlink

if mavlink.WIRE_PROTOCOL_VERSION != "2.0":
    raise RuntimeError(
        "pymavlink was imported as MAVLink1 before vehicle_companion could select "
        "MAVLink2; set MAVLINK20=1 in the environment before starting."
    )

__all__ = ["mavutil", "mavlink"]
