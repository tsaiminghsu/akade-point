"""A small ArduPilot-like autopilot over UDP, for tests and UI development
without SITL.

It is deliberately modest: flat-earth kinematics, the command and mission
behaviour the companion relies on, a parameter table, a gimbal component and
optional misbehaviour for tests (dropped commands, a foreign ack, a Mission
Planner heartbeat, failing pre-arm checks). It shares the companion author's
assumptions, so anything verified only here still needs a SITL run.

    python -m vehicle_companion.tools.fake_autopilot --vehicle copter --to 127.0.0.1:14550
"""

from __future__ import annotations

import argparse
import math
import os
import socket
import struct
import threading
import time
from collections import OrderedDict
from typing import Optional

os.environ.setdefault("MAVLINK20", "1")

from ..mav.proto import mavlink, mavutil  # noqa: E402

EARTH_R = 6378137.0
BASE_MODE_DISARMED = 81  # CUSTOM_MODE_ENABLED | STABILIZE | MANUAL_INPUT, as ArduPilot sends
ARMED_FLAG = mavlink.MAV_MODE_FLAG_SAFETY_ARMED

SENSORS_PRESENT = 1 | 2 | 4 | 8 | 32 | 65536 | 2097152 | 33554432 | mavlink.MAV_SYS_STATUS_PREARM_CHECK

COPTER_PARAMS = [
    ("SYSID_THISMAV", 1, 4),
    ("SYSID_MYGCS", 255, 4),
    ("FS_GCS_ENABLE", 0, 2),
    ("FS_GCS_TIMEOUT", 5, 9),
    ("FS_THR_ENABLE", 1, 2),
    ("FS_EKF_ACTION", 1, 2),
    ("BATT_MONITOR", 4, 2),
    ("BATT_LOW_VOLT", 14.0, 9),
    ("BATT_CRT_VOLT", 13.2, 9),
    ("BATT_FS_LOW_ACT", 2, 2),
    ("BATT_FS_CRT_ACT", 1, 2),
    ("FENCE_ENABLE", 0, 2),
    ("FENCE_TYPE", 3, 2),
    ("FENCE_ACTION", 1, 2),
    ("FENCE_ALT_MAX", 100, 9),
    ("FENCE_RADIUS", 300, 9),
    ("RTL_ALT", 1500, 6),
    ("WPNAV_SPEED", 500, 9),
    ("ARMING_CHECK", 1, 6),
    ("MNT1_TYPE", 0, 2),
    ("SERIAL2_PROTOCOL", 2, 2),
    ("SERIAL2_BAUD", 921, 6),
    ("ANGLE_MAX", 3000, 4),
]
ROVER_PARAMS = [
    ("SYSID_THISMAV", 1, 4),
    ("SYSID_MYGCS", 255, 4),
    ("FS_ACTION", 2, 2),
    ("FS_TIMEOUT", 1.5, 9),
    ("FS_GCS_ENABLE", 0, 2),
    ("FS_THR_ENABLE", 1, 2),
    ("BATT_MONITOR", 4, 2),
    ("BATT_LOW_VOLT", 10.5, 9),
    ("BATT_FS_LOW_ACT", 2, 2),
    ("FENCE_ENABLE", 0, 2),
    ("FENCE_TYPE", 6, 2),
    ("FENCE_ACTION", 2, 2),
    ("CRUISE_SPEED", 2.0, 9),
    ("WP_RADIUS", 2.0, 9),
    ("WP_PIVOT_ANGLE", 60, 4),
    ("ARMING_CHECK", 1, 6),
    ("SERIAL2_PROTOCOL", 2, 2),
]

# Messages sent without being asked, at these rates (roughly ArduPilot's SRx defaults).
DEFAULT_STREAMS = {
    "ATTITUDE": 2.0,
    "GLOBAL_POSITION_INT": 2.0,
    "VFR_HUD": 2.0,
    "SYS_STATUS": 1.0,
    "GPS_RAW_INT": 1.0,
    "MISSION_CURRENT": 1.0,
    "BATTERY_STATUS": 1.0,
}
STREAMABLE = [
    "ATTITUDE",
    "GLOBAL_POSITION_INT",
    "VFR_HUD",
    "SYS_STATUS",
    "GPS_RAW_INT",
    "MISSION_CURRENT",
    "BATTERY_STATUS",
    "EKF_STATUS_REPORT",
    "VIBRATION",
    "NAV_CONTROLLER_OUTPUT",
    "HOME_POSITION",
    "RC_CHANNELS",
    "FENCE_STATUS",
    "WIND",
    "SYSTEM_TIME",
]
MSG_IDS = {name: getattr(mavlink, f"MAVLINK_MSG_ID_{name}") for name in STREAMABLE + ["AUTOPILOT_VERSION"]}
NAME_BY_ID = {v: k for k, v in MSG_IDS.items()}

NAV_COMMANDS = frozenset({16, 17, 18, 19, 20, 21, 22, 82})


def f32(v: float) -> float:
    return struct.unpack("<f", struct.pack("<f", float(v)))[0]


def offset(lat: float, lon: float, north: float, east: float) -> tuple[float, float]:
    dlat = north / EARTH_R
    dlon = east / (EARTH_R * math.cos(math.radians(lat)))
    return lat + math.degrees(dlat), lon + math.degrees(dlon)


def distance_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    north = math.radians(lat2 - lat1) * EARTH_R
    east = math.radians(lon2 - lon1) * EARTH_R * math.cos(math.radians(lat1))
    return math.hypot(north, east), (math.degrees(math.atan2(east, north)) + 360) % 360


class _Out:
    def __init__(self, sock: socket.socket, addr: tuple[str, int]):
        self.sock = sock
        self.addr = addr

    def write(self, buf: bytes) -> None:
        try:
            self.sock.sendto(buf, self.addr)
        except OSError:
            pass


class FakeAutopilot:
    def __init__(
        self,
        target: tuple[str, int] = ("127.0.0.1", 14550),
        *,
        vehicle: str = "copter",
        home: tuple[float, float, float] = (25.0330, 121.5654, 12.0),
        sysid: int = 1,
        tick_s: float = 0.02,
        speedup: float = 1.0,
        gimbal: bool = True,
        prearm_fail: Optional[str] = None,
        prearm_every_s: float = 30.0,
        payload: bool = False,
        adsb: bool = False,
        signing_key: Optional[bytes] = None,
    ):
        self.vehicle = vehicle
        self.sysid = sysid
        self.tick_s = tick_s
        self.speedup = speedup
        self.with_gimbal = gimbal
        self.prearm_fail = prearm_fail
        self.prearm_every_s = prearm_every_s

        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("0.0.0.0", 0))
        self.sock.setblocking(False)
        out = _Out(self.sock, target)
        self.mav = mavlink.MAVLink(out, srcSystem=sysid, srcComponent=1)
        self.gimbal_mav = mavlink.MAVLink(out, srcSystem=sysid, srcComponent=154)
        self.gcs_mav = mavlink.MAVLink(out, srcSystem=255, srcComponent=190)
        self.payload_mav = mavlink.MAVLink(out, srcSystem=sysid, srcComponent=25)
        self.with_payload = payload
        self.with_adsb = adsb
        # MAVLink2 signing: with a key, unsigned input is dropped, as ArduPilot
        # does on a non-USB port. SETUP_SIGNING received is kept here.
        self.signing_key = signing_key
        self.setup_signing_key: Optional[bytes] = None
        self.relays = [False] * 4
        self.servos = [1500.0] * 2
        self.parser = mavlink.MAVLink(None)
        self.parser.robust_parsing = True
        if signing_key:
            self.parser.signing.secret_key = signing_key
            self.parser.signing.allow_unsigned_callback = lambda _mav, _msg_id: False

        self.mav_type = mavlink.MAV_TYPE_QUADROTOR if vehicle == "copter" else mavlink.MAV_TYPE_GROUND_ROVER
        self.modes = dict(mavutil.mode_mapping_byname(self.mav_type))
        self.mode_names = {v: k for k, v in self.modes.items()}
        self.custom_mode = self.modes["STABILIZE" if vehicle == "copter" else "MANUAL"]
        self.armed = False
        self.home = home
        self.lat, self.lon = home[0], home[1]
        self.alt_rel = 0.0
        self.heading = 0.0
        self.groundspeed = 0.0
        self.climb = 0.0
        self.speed = 5.0 if vehicle == "copter" else 2.0
        self.target: Optional[tuple[float, float, float]] = None
        self.manual: Optional[tuple[float, float, float]] = None  # vx, yaw_rate(rad/s), until
        self.paused = False
        self.battery_pct = 100.0
        self.roll = self.pitch = 0.0

        params = COPTER_PARAMS if vehicle == "copter" else ROVER_PARAMS
        self.params: OrderedDict[str, list] = OrderedDict((n, [f32(v), t]) for n, v, t in params)
        self.missions: dict[int, list[dict]] = {0: [], 1: [], 2: []}
        self.mission_current = 0
        self.upload: Optional[dict] = None

        self.gimbal = {"pitch": 0.0, "yaw": 0.0, "mode": 3, "roi": None}

        self.intervals: dict[str, float] = {k: 1.0 / v for k, v in DEFAULT_STREAMS.items()}
        self._last_sent: dict[str, float] = {}
        self._last_hb = 0.0
        self._last_prearm = 0.0
        self._boot = time.monotonic()

        # Test hooks.
        self.lock = threading.Lock()
        self.received: list[str] = []
        self.commands: list[tuple] = []
        self.drop_commands = 0
        self.inject_gcs_heartbeat = False
        self.foreign_ack_first = False
        self.drop_param_indices: set[int] = set()
        # DataFlash logs: id -> (bytes, UTC seconds). Offsets in drop_log_offsets
        # are skipped once, as a lossy link would.
        self.dataflash: dict[int, tuple[bytes, int]] = {
            1: (bytes((i * 7 + 3) % 256 for i in range(12_345)), 1_790_000_000),
            2: (bytes((i * 13 + 1) % 256 for i in range(200_000)), 1_790_003_600),
        }
        self.drop_log_offsets: set[int] = set()
        self.log_silent = False  # stop answering LOG_REQUEST_DATA
        # Messages from a camera component (100), as ArduPilot's AP_Camera sees them.
        self.from_camera: list = []
        self.log_requests: list[tuple[int, int, int]] = []
        self.drop_mission_requests = 0
        self.upload_reject: Optional[int] = None

        self._running = False
        self._thread: Optional[threading.Thread] = None

    # ---- lifecycle -----------------------------------------------------

    def start(self) -> "FakeAutopilot":
        self._running = True
        self._thread = threading.Thread(target=self._loop, name="fake-autopilot", daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2)
        self.sock.close()

    @property
    def mode(self) -> str:
        return self.mode_names.get(self.custom_mode, str(self.custom_mode))

    def time_boot_ms(self) -> int:
        return int((time.monotonic() - self._boot) * 1000)

    def _loop(self) -> None:
        last = time.monotonic()
        while self._running:
            now = time.monotonic()
            self._recv_all()
            with self.lock:
                self._step((now - last) * self.speedup)
                self._emit(now)
            last = now
            time.sleep(self.tick_s)

    # ---- receive -------------------------------------------------------

    def _recv_all(self) -> None:
        while True:
            try:
                data, _ = self.sock.recvfrom(4096)
            except (BlockingIOError, InterruptedError):
                return
            except OSError:  # ConnectionResetError on Windows when the peer is gone
                return
            try:
                msgs = self.parser.parse_buffer(data) or []
            except mavlink.MAVError:
                continue
            for msg in msgs:
                if msg.get_type() == "BAD_DATA":
                    continue
                with self.lock:
                    self.received.append(msg.get_type())
                    self._handle(msg)

    def _for_me(self, msg, comps=(0, 1)) -> bool:
        ts = getattr(msg, "target_system", 0)
        tc = getattr(msg, "target_component", 0)
        return ts in (0, self.sysid) and tc in comps

    def _handle(self, msg) -> None:
        t = msg.get_type()
        if msg.get_srcComponent() == 100:
            self.from_camera.append(msg)
        handler = getattr(self, f"_on_{t.lower()}", None)
        if handler is not None:
            handler(msg)

    # ---- commands ------------------------------------------------------

    def _ack(self, command: int, result: int, msg) -> None:
        if self.foreign_ack_first and command == 400:
            self.mav.send(self.mav.command_ack_encode(command, mavlink.MAV_RESULT_DENIED, 0, 0, 255, 190))
        self.mav.send(self.mav.command_ack_encode(command, result, 0, 0, msg.get_srcSystem(), msg.get_srcComponent()))

    def _on_command_long(self, msg) -> None:
        if self.with_payload and msg.target_system == self.sysid and msg.target_component == 25:
            self._payload_command(msg)
            return
        if not self._for_me(msg, (0, 1, 154)):
            return
        self.commands.append(("long", msg.command, [msg.param1, msg.param2, msg.param3, msg.param4, msg.param5, msg.param6, msg.param7], msg.confirmation))
        if self.drop_commands > 0:
            self.drop_commands -= 1
            return
        p = [msg.param1, msg.param2, msg.param3, msg.param4, msg.param5, msg.param6, msg.param7]
        result = self._command(msg.command, p, via="long")
        if result is not None:
            self._ack(msg.command, result, msg)

    def _on_command_int(self, msg) -> None:
        if not self._for_me(msg, (0, 1, 154)):
            return
        self.commands.append(("int", msg.command, [msg.param1, msg.param2, msg.param3, msg.param4, msg.x, msg.y, msg.z], msg.frame))
        if self.drop_commands > 0:
            self.drop_commands -= 1
            return
        p = [msg.param1, msg.param2, msg.param3, msg.param4, msg.x / 1e7, msg.y / 1e7, msg.z]
        result = self._command(msg.command, p, via="int", frame=msg.frame)
        if result is not None:
            self._ack(msg.command, result, msg)

    def _command(self, cmd: int, p: list[float], via: str, frame: Optional[int] = None) -> Optional[int]:
        R = mavlink
        if cmd == 400:  # arm/disarm
            return self._arm_disarm(p[0] == 1, int(p[1]) == 21196)
        if cmd == 176:  # DO_SET_MODE
            return self._set_mode(int(p[1]))
        if cmd == 22:  # NAV_TAKEOFF
            if self.vehicle != "copter" or self.mode != "GUIDED" or not self.armed:
                return R.MAV_RESULT_FAILED
            self.target = (self.lat, self.lon, float(p[6]))
            self.statustext(6, f"Takeoff to {p[6]:.0f}m")
            return R.MAV_RESULT_ACCEPTED
        if cmd == 21:
            return self._set_mode(self.modes.get("LAND", -1))
        if cmd == 20:
            return self._set_mode(self.modes["RTL"])
        if cmd == 300:  # MISSION_START
            if not self.armed or len(self.missions[0]) < 2:
                return R.MAV_RESULT_FAILED
            self.custom_mode = self.modes["AUTO"]
            self.mission_current = max(1, self.mission_current)
            self.paused = False
            return R.MAV_RESULT_ACCEPTED
        if cmd == 511:  # SET_MESSAGE_INTERVAL
            name = NAME_BY_ID.get(int(p[0]))
            if name is None:
                return R.MAV_RESULT_DENIED
            interval = p[1]
            if interval < 0:
                self.intervals.pop(name, None)
            elif interval == 0:
                if name in DEFAULT_STREAMS:
                    self.intervals[name] = 1.0 / DEFAULT_STREAMS[name]
                else:
                    self.intervals.pop(name, None)
            else:
                self.intervals[name] = interval / 1e6
            return R.MAV_RESULT_ACCEPTED
        if cmd == 512:  # REQUEST_MESSAGE
            name = NAME_BY_ID.get(int(p[0]))
            if name is None:
                return R.MAV_RESULT_DENIED
            self.send_message(name)
            return R.MAV_RESULT_ACCEPTED
        if cmd == 520:
            self.send_message("AUTOPILOT_VERSION")
            return R.MAV_RESULT_ACCEPTED
        if cmd == 224:  # DO_SET_MISSION_CURRENT
            seq = int(p[0])
            if seq >= len(self.missions[0]):
                return R.MAV_RESULT_DENIED
            self.mission_current = seq
            self.send_message("MISSION_CURRENT")
            return R.MAV_RESULT_ACCEPTED
        if cmd == 178:
            if p[1] > 0:
                self.speed = float(p[1])
            return R.MAV_RESULT_ACCEPTED
        if cmd == 193:
            if self.mode != "AUTO":
                return R.MAV_RESULT_FAILED
            self.paused = p[0] == 0
            return R.MAV_RESULT_ACCEPTED
        if cmd == 179:  # DO_SET_HOME
            if p[0] == 1:
                self.home = (self.lat, self.lon, self.home[2] + self.alt_rel)
            else:
                self.home = (float(p[4]), float(p[5]), float(p[6]))
            return R.MAV_RESULT_ACCEPTED
        if cmd == 401:
            if self.prearm_fail:
                self.statustext(2, f"PreArm: {self.prearm_fail}")
            return R.MAV_RESULT_ACCEPTED
        if cmd == 246:
            return R.MAV_RESULT_DENIED if self.armed else R.MAV_RESULT_ACCEPTED
        if cmd == 207:  # DO_FENCE_ENABLE
            self.params["FENCE_ENABLE"][0] = f32(p[0])
            return R.MAV_RESULT_ACCEPTED
        if cmd == 192:  # DO_REPOSITION: ArduPilot handles it as COMMAND_INT only
            if via != "int":
                return R.MAV_RESULT_UNSUPPORTED
            if int(p[1]) & 1:
                self._set_mode(self.modes["GUIDED"])
            if self.mode != "GUIDED":
                return R.MAV_RESULT_FAILED
            alt = float(p[6]) if self.vehicle == "copter" else 0.0
            self.target = (float(p[4]), float(p[5]), alt)
            return R.MAV_RESULT_ACCEPTED
        if cmd == 1000:  # DO_GIMBAL_MANAGER_PITCHYAW
            if not math.isnan(p[0]):
                self.gimbal["pitch"] = max(-90.0, min(30.0, float(p[0])))
            if not math.isnan(p[1]):
                self.gimbal["yaw"] = float(p[1])
            self.gimbal["roi"] = None
            return R.MAV_RESULT_ACCEPTED
        if cmd == 205:  # DO_MOUNT_CONTROL, param7 = mount mode
            self.gimbal["mode"] = int(p[6])
            if int(p[6]) == 0:
                self.gimbal["pitch"] = 0.0
            return R.MAV_RESULT_ACCEPTED
        if cmd == 195:  # DO_SET_ROI_LOCATION
            self.gimbal["roi"] = (float(p[4]), float(p[5]), float(p[6]))
            return R.MAV_RESULT_ACCEPTED
        if cmd == 197:  # DO_SET_ROI_NONE
            self.gimbal["roi"] = None
            return R.MAV_RESULT_ACCEPTED
        return R.MAV_RESULT_UNSUPPORTED

    def _payload_command(self, msg) -> None:
        """The ESP32 payload node: relays (181), servos (183), pulse (31010)."""
        R = mavlink
        i = int(msg.param1)
        result = R.MAV_RESULT_UNSUPPORTED
        if msg.command in (181, 31010):
            result = R.MAV_RESULT_ACCEPTED if 0 <= i < len(self.relays) else R.MAV_RESULT_DENIED
            if result == R.MAV_RESULT_ACCEPTED:
                self.relays[i] = msg.command == 31010 or msg.param2 >= 0.5
        elif msg.command == 183:
            result = R.MAV_RESULT_ACCEPTED if 0 <= i < len(self.servos) and 500 <= msg.param2 <= 2500 else R.MAV_RESULT_DENIED
            if result == R.MAV_RESULT_ACCEPTED:
                self.servos[i] = msg.param2
        self.commands.append(("payload", msg.command, [msg.param1, msg.param2], 0))
        self.payload_mav.send(self.payload_mav.command_ack_encode(msg.command, result, 0, 0, msg.get_srcSystem(), msg.get_srcComponent()))

    def _arm_disarm(self, arm: bool, force: bool) -> int:
        R = mavlink
        if arm:
            if self.armed:
                return R.MAV_RESULT_ACCEPTED
            if self.prearm_fail and not force:
                self.statustext(2, f"PreArm: {self.prearm_fail}")
                return R.MAV_RESULT_FAILED
            if self.vehicle == "copter" and self.mode in ("AUTO", "RTL", "LAND"):
                self.statustext(2, "Arm: Mode not armable")
                return R.MAV_RESULT_FAILED
            self.armed = True
            self.home = (self.lat, self.lon, self.home[2])
            return R.MAV_RESULT_ACCEPTED
        if not self.armed:
            return R.MAV_RESULT_ACCEPTED
        if self.vehicle == "copter" and self.alt_rel > 0.5 and not force:
            self.statustext(3, "Disarm: vehicle is flying")
            return R.MAV_RESULT_FAILED
        self._disarm()
        return R.MAV_RESULT_ACCEPTED

    def _disarm(self) -> None:
        self.armed = False
        self.target = None
        self.manual = None
        if self.alt_rel > 0:
            self.alt_rel = 0.0

    def _set_mode(self, number: int) -> int:
        if number not in self.mode_names:
            return mavlink.MAV_RESULT_FAILED
        name = self.mode_names[number]
        if self.custom_mode != number:
            self.custom_mode = number
            self.statustext(6, f"Mode {name}")
        self.target = None if name not in ("GUIDED",) else self.target
        self.paused = False
        if name == "AUTO" and self.mission_current == 0:
            self.mission_current = 1
        return mavlink.MAV_RESULT_ACCEPTED

    def _on_set_mode(self, msg) -> None:
        if msg.target_system not in (0, self.sysid):
            return
        result = self._set_mode(msg.custom_mode)
        self.mav.send(self.mav.command_ack_encode(mavlink.MAVLINK_MSG_ID_SET_MODE, result, 0, 0, msg.get_srcSystem(), msg.get_srcComponent()))

    def _on_set_position_target_global_int(self, msg) -> None:
        if not self._for_me(msg) or self.mode != "GUIDED":
            return
        alt = msg.alt if self.vehicle == "copter" else 0.0
        self.target = (msg.lat_int / 1e7, msg.lon_int / 1e7, alt)

    def _on_set_position_target_local_ned(self, msg) -> None:
        if not self._for_me(msg) or self.mode != "GUIDED" or not self.armed:
            return
        # Velocity + yaw rate in the body frame (the rover joystick).
        self.manual = (float(msg.vx), float(msg.yaw_rate), time.monotonic() + 3.0)
        self.target = None

    def _on_mission_set_current(self, msg) -> None:
        if self._for_me(msg) and msg.seq < len(self.missions[0]):
            self.mission_current = msg.seq
            self.send_message("MISSION_CURRENT")

    # ---- mission protocol ----------------------------------------------

    def _on_mission_count(self, msg) -> None:
        if not self._for_me(msg):
            return
        mtype = msg.mission_type
        if self.upload_reject is not None:
            self.mav.send(self.mav.mission_ack_encode(msg.get_srcSystem(), msg.get_srcComponent(), self.upload_reject, mtype))
            return
        if msg.count == 0:
            self.missions[mtype] = []
            self.mav.send(self.mav.mission_ack_encode(msg.get_srcSystem(), msg.get_srcComponent(), 0, mtype))
            return
        self.upload = {"type": mtype, "count": msg.count, "items": [None] * msg.count, "next": 0, "last": 0.0,
                       "peer": (msg.get_srcSystem(), msg.get_srcComponent())}
        self._request_next()

    def _request_next(self) -> None:
        up = self.upload
        up["last"] = time.monotonic()
        if self.drop_mission_requests > 0:
            self.drop_mission_requests -= 1
            return
        self.mav.send(self.mav.mission_request_int_encode(up["peer"][0], up["peer"][1], up["next"], up["type"]))

    def _on_mission_item_int(self, msg) -> None:
        if not self._for_me(msg) or self.upload is None or msg.mission_type != self.upload["type"]:
            return
        up = self.upload
        if msg.seq != up["next"]:
            self._request_next()
            return
        up["items"][msg.seq] = {
            "frame": msg.frame, "command": msg.command, "current": msg.current, "autocontinue": msg.autocontinue,
            "p": [msg.param1, msg.param2, msg.param3, msg.param4], "x": msg.x, "y": msg.y, "z": msg.z,
        }
        up["next"] += 1
        if up["next"] < up["count"]:
            self._request_next()
            return
        self.missions[up["type"]] = up["items"]
        if up["type"] == 0:
            self.mission_current = 0
        self.mav.send(self.mav.mission_ack_encode(up["peer"][0], up["peer"][1], 0, up["type"]))
        self.upload = None

    def _on_mission_request_list(self, msg) -> None:
        if self._for_me(msg):
            self.mav.send(self.mav.mission_count_encode(msg.get_srcSystem(), msg.get_srcComponent(), len(self.missions[msg.mission_type]), msg.mission_type))

    def _send_item(self, msg) -> None:
        items = self.missions[msg.mission_type]
        if msg.seq >= len(items):
            return
        it = items[msg.seq]
        self.mav.send(
            self.mav.mission_item_int_encode(
                msg.get_srcSystem(), msg.get_srcComponent(), msg.seq, it["frame"], it["command"],
                1 if (msg.mission_type == 0 and msg.seq == self.mission_current) else 0,
                it["autocontinue"], *it["p"], it["x"], it["y"], it["z"], msg.mission_type,
            )
        )

    def _on_mission_request_int(self, msg) -> None:
        if self._for_me(msg):
            self._send_item(msg)

    def _on_mission_request(self, msg) -> None:
        if self._for_me(msg):
            self._send_item(msg)

    def _on_mission_clear_all(self, msg) -> None:
        if not self._for_me(msg):
            return
        types = (0, 1, 2) if msg.mission_type == 255 else (msg.mission_type,)
        for t in types:
            self.missions[t] = []
        self.mav.send(self.mav.mission_ack_encode(msg.get_srcSystem(), msg.get_srcComponent(), 0, msg.mission_type))

    # ---- parameters ----------------------------------------------------

    def _param_value(self, name: str, index: int) -> None:
        value, ptype = self.params[name]
        self.mav.send(self.mav.param_value_encode(name.encode(), value, ptype, len(self.params), index))

    def _on_param_request_list(self, msg) -> None:
        if not self._for_me(msg):
            return
        for i, name in enumerate(self.params):
            if i in self.drop_param_indices:
                continue
            self._param_value(name, i)
        self.drop_param_indices = set()

    # ---- DataFlash -------------------------------------------------------

    def _on_log_request_list(self, msg) -> None:
        if not self._for_me(msg, (0, 1)):
            return
        ids = sorted(self.dataflash)
        for i in ids:
            data, utc = self.dataflash[i]
            self.mav.send(self.mav.log_entry_encode(i, len(ids), ids[-1] if ids else 0, utc, len(data)))

    def _on_log_request_data(self, msg) -> None:
        if not self._for_me(msg, (0, 1)) or msg.id not in self.dataflash:
            return
        self.log_requests.append((msg.id, msg.ofs, msg.count))
        if self.log_silent:
            return
        data = self.dataflash[msg.id][0]
        end = min(len(data), msg.ofs + msg.count)
        ofs = msg.ofs
        while ofs < end:
            n = min(90, end - ofs)
            if ofs in self.drop_log_offsets:
                self.drop_log_offsets.discard(ofs)
            else:
                chunk = data[ofs:ofs + n]
                self.mav.send(self.mav.log_data_encode(msg.id, ofs, n, chunk + bytes(90 - n)))
            ofs += n

    def _on_terrain_data(self, msg) -> None:
        cb = getattr(self, "on_terrain_data", None)
        if cb is not None:
            cb(msg)

    def _on_setup_signing(self, msg) -> None:
        if not self._for_me(msg, (0, 1)):
            return
        self.setup_signing_key = bytes(msg.secret_key)

    def _on_param_request_read(self, msg) -> None:
        if not self._for_me(msg):
            return
        names = list(self.params)
        if msg.param_index >= 0:
            if msg.param_index < len(names):
                self._param_value(names[msg.param_index], msg.param_index)
            return
        name = msg.param_id.rstrip("\x00") if isinstance(msg.param_id, str) else msg.param_id.decode().rstrip("\x00")
        if name in self.params:
            self._param_value(name, names.index(name))

    def _on_param_set(self, msg) -> None:
        if not self._for_me(msg):
            return
        name = msg.param_id.rstrip("\x00") if isinstance(msg.param_id, str) else msg.param_id.decode().rstrip("\x00")
        if name not in self.params:
            return
        self.params[name][0] = f32(msg.param_value)
        self._param_value(name, 65535)  # ArduPilot echoes a set with index 65535

    # ---- simulation ----------------------------------------------------

    def _mission_nav_target(self) -> Optional[tuple[int, dict]]:
        items = self.missions[0]
        while self.mission_current < len(items):
            it = items[self.mission_current]
            if it["command"] in NAV_COMMANDS:
                return self.mission_current, it
            if it["command"] == 178 and it["p"][1] > 0:
                self.speed = it["p"][1]
            self.mission_current += 1
        return None

    def _step(self, dt: float) -> None:
        if dt <= 0:
            return
        self.climb = 0.0
        self.groundspeed = 0.0
        if self.armed:
            self.battery_pct = max(0.0, self.battery_pct - dt * 0.05)
        mode = self.mode
        if not self.armed:
            self.roll = self.pitch = 0.0
            return

        goal: Optional[tuple[float, float, float]] = None
        if mode == "GUIDED":
            goal = self.target
            if self.manual is not None:
                vx, yaw_rate, until = self.manual
                if time.monotonic() > until:
                    self.manual = None
                else:
                    self.heading = (self.heading + math.degrees(yaw_rate) * dt) % 360
                    n = vx * dt * math.cos(math.radians(self.heading))
                    e = vx * dt * math.sin(math.radians(self.heading))
                    self.lat, self.lon = offset(self.lat, self.lon, n, e)
                    self.groundspeed = abs(vx)
        elif mode == "AUTO" and not self.paused:
            nav = self._mission_nav_target()
            if nav is None:
                self._set_mode(self.modes["LOITER" if self.vehicle == "copter" else "HOLD"])
            else:
                seq, it = nav
                cmd = it["command"]
                if cmd == 22:
                    goal = (self.lat, self.lon, it["z"])
                    if abs(self.alt_rel - it["z"]) < 0.5:
                        self.mission_current += 1
                elif cmd == 20:
                    self._set_mode(self.modes["RTL"])
                elif cmd == 21:
                    self._set_mode(self.modes["LAND"])
                else:
                    lat, lon = it["x"] / 1e7, it["y"] / 1e7
                    alt = it["z"] if self.vehicle == "copter" else 0.0
                    goal = (lat, lon, alt)
                    dist, _ = distance_bearing(self.lat, self.lon, lat, lon)
                    if dist < 1.5 and abs(self.alt_rel - alt) < 1.0:
                        self.mission_current += 1
        elif mode == "RTL":
            rtl_alt = self.params.get("RTL_ALT", [1500])[0] / 100.0 if self.vehicle == "copter" else 0.0
            dist, _ = distance_bearing(self.lat, self.lon, self.home[0], self.home[1])
            if self.vehicle == "copter" and self.alt_rel < rtl_alt - 0.5 and dist > 2:
                goal = (self.lat, self.lon, rtl_alt)
            elif dist > 1.0:
                goal = (self.home[0], self.home[1], max(self.alt_rel, rtl_alt) if self.vehicle == "copter" else 0.0)
            elif self.vehicle == "copter":
                self.custom_mode = self.modes["LAND"]
            else:
                self.custom_mode = self.modes["HOLD"]
        if self.mode == "LAND":
            goal = (self.lat, self.lon, 0.0)

        if goal is not None:
            lat, lon, alt = goal
            dist, brg = distance_bearing(self.lat, self.lon, lat, lon)
            step = min(dist, self.speed * dt)
            if step > 0.01:
                self.heading = brg
                n = step * math.cos(math.radians(brg))
                e = step * math.sin(math.radians(brg))
                self.lat, self.lon = offset(self.lat, self.lon, n, e)
                self.groundspeed = step / dt
            if self.vehicle == "copter":
                vrate = 1.0 if self.mode == "LAND" else 2.5
                dz = alt - self.alt_rel
                dz_step = max(-vrate * dt, min(vrate * dt, dz))
                self.alt_rel += dz_step
                self.climb = dz_step / dt
        if self.vehicle == "copter" and self.mode == "LAND" and self.alt_rel <= 0.05:
            self.alt_rel = 0.0
            self._disarm()
            self.statustext(6, "Disarming motors")
        # A little attitude so a HUD has something to show.
        t = time.monotonic() - self._boot
        self.pitch = -min(15.0, self.groundspeed * 2.0) + 1.5 * math.sin(t * 0.7)
        self.roll = 2.0 * math.sin(t * 0.9)

    # ---- emission ------------------------------------------------------

    def statustext(self, severity: int, text: str) -> None:
        self.mav.send(self.mav.statustext_encode(severity, text.encode()[:50]))

    def _heartbeat(self) -> None:
        base = BASE_MODE_DISARMED | (ARMED_FLAG if self.armed else 0)
        status = mavlink.MAV_STATE_ACTIVE if self.armed else mavlink.MAV_STATE_STANDBY
        self.mav.send(self.mav.heartbeat_encode(self.mav_type, mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA, base, self.custom_mode, status))
        if self.with_gimbal:
            self.gimbal_mav.send(self.gimbal_mav.heartbeat_encode(mavlink.MAV_TYPE_GIMBAL, mavlink.MAV_AUTOPILOT_INVALID, 0, 0, mavlink.MAV_STATE_ACTIVE))
        if self.with_payload:
            self.payload_mav.send(self.payload_mav.heartbeat_encode(mavlink.MAV_TYPE_ONBOARD_CONTROLLER, mavlink.MAV_AUTOPILOT_INVALID, 0, 0, mavlink.MAV_STATE_ACTIVE))
            tb = self.time_boot_ms()
            self.payload_mav.send(self.payload_mav.named_value_float_encode(tb, b"PAY_VBAT", 12.4))
            for i, on in enumerate(self.relays):
                self.payload_mav.send(self.payload_mav.named_value_float_encode(tb, f"RELAY{i}".encode(), 1.0 if on else 0.0))
        if self.with_adsb:
            self._adsb_traffic()
        if self.inject_gcs_heartbeat:
            self.gcs_mav.send(self.gcs_mav.heartbeat_encode(mavlink.MAV_TYPE_GCS, mavlink.MAV_AUTOPILOT_INVALID, 0, 0, mavlink.MAV_STATE_ACTIVE))

    # (ICAO, callsign, orbit radius m, height above home m, period s)
    ADSB_TRAFFIC = ((0x899001, "CAL123", 3000.0, 600.0, 240.0), (0x899002, "EVA456", 6000.0, 1200.0, 400.0), (0x899003, "N0NEAR", 250.0, 60.0, 120.0))

    def _adsb_traffic(self) -> None:
        """Aircraft circling home, as ArduPilot forwards them from its ADS-B
        receiver (ADSB_VEHICLE from the autopilot component)."""
        t = self.time_boot_ms() / 1000.0
        for icao, cs, radius, height, period in self.ADSB_TRAFFIC:
            a = 2 * math.pi * t / period
            lat = self.home[0] + (radius * math.cos(a)) / 111_320.0
            lon = self.home[1] + (radius * math.sin(a)) / (111_320.0 * math.cos(math.radians(self.home[0])))
            hdg = (math.degrees(a) + 90.0) % 360.0
            spd = 2 * math.pi * radius / period
            self.mav.send(self.mav.adsb_vehicle_encode(
                icao, int(lat * 1e7), int(lon * 1e7), 0, int((self.home[2] + height) * 1000), int(hdg * 100),
                int(spd * 100), 0, cs.encode(), 1, 1, 1 | 2 | 4 | 8 | 16, 1200))

    def _emit(self, now: float) -> None:
        if now - self._last_hb >= 1.0:
            self._last_hb = now
            self._heartbeat()
            if self.with_gimbal:
                self._gimbal_status()
        for name, interval in list(self.intervals.items()):
            if now - self._last_sent.get(name, 0.0) >= interval:
                self._last_sent[name] = now
                self.send_message(name)
        if self.prearm_fail and not self.armed and now - self._last_prearm >= self.prearm_every_s:
            self._last_prearm = now
            self.statustext(2, f"PreArm: {self.prearm_fail}")
        if self.upload is not None and now - self.upload["last"] > 1.0:
            self._request_next()

    def _gimbal_status(self) -> None:
        pitch, yaw = math.radians(self.gimbal["pitch"]), math.radians(self.gimbal["yaw"])
        cy, sy, cp, sp = math.cos(yaw / 2), math.sin(yaw / 2), math.cos(pitch / 2), math.sin(pitch / 2)
        q = [cy * cp, -sy * sp, cy * sp, sy * cp]
        self.gimbal_mav.send(self.gimbal_mav.gimbal_device_attitude_status_encode(0, 0, self.time_boot_ms(), 0, q, 0, 0, 0, 0))

    def send_message(self, name: str) -> None:
        m = self.mav
        tb = self.time_boot_ms()
        home_alt = self.home[2]
        if name == "ATTITUDE":
            m.send(m.attitude_encode(tb, math.radians(self.roll), math.radians(self.pitch), math.radians(self.heading), 0, 0, 0))
        elif name == "GLOBAL_POSITION_INT":
            m.send(m.global_position_int_encode(tb, int(self.lat * 1e7), int(self.lon * 1e7), int((home_alt + self.alt_rel) * 1000),
                                                int(self.alt_rel * 1000), 0, 0, int(-self.climb * 100), int(self.heading * 100) % 36000))
        elif name == "VFR_HUD":
            thr = 0 if not self.armed else int(40 + self.climb * 5)
            m.send(m.vfr_hud_encode(self.groundspeed, self.groundspeed, int(self.heading), max(0, min(100, thr)), home_alt + self.alt_rel, self.climb))
        elif name == "SYS_STATUS":
            health = SENSORS_PRESENT
            if self.prearm_fail:
                health &= ~mavlink.MAV_SYS_STATUS_PREARM_CHECK
            m.send(m.sys_status_encode(SENSORS_PRESENT, SENSORS_PRESENT, health, 250, int(self._voltage() * 1000),
                                       1200 if self.armed else 50, int(self.battery_pct), 0, 0, 0, 0, 0, 0))
        elif name == "BATTERY_STATUS":
            volts = [int(self._voltage() * 1000)] + [65535] * 9
            m.send(m.battery_status_encode(0, 0, 0, 3000, volts, 1200 if self.armed else 50, int((100 - self.battery_pct) * 50), -1, int(self.battery_pct)))
        elif name == "GPS_RAW_INT":
            m.send(m.gps_raw_int_encode(tb * 1000, 3, int(self.lat * 1e7), int(self.lon * 1e7), int((home_alt + self.alt_rel) * 1000),
                                        80, 120, int(self.groundspeed * 100), int(self.heading * 100) % 36000, 14))
        elif name == "MISSION_CURRENT":
            m.send(m.mission_current_encode(self.mission_current, len(self.missions[0])))
        elif name == "EKF_STATUS_REPORT":
            m.send(m.ekf_status_report_encode(0x3FF, 0.05, 0.08, 0.04, 0.03, 0.0))
        elif name == "VIBRATION":
            v = 8.0 if self.armed else 0.5
            m.send(m.vibration_encode(tb * 1000, v, v * 1.1, v * 1.4, 0, 0, 0))
        elif name == "NAV_CONTROLLER_OUTPUT":
            dist = 0
            brg = int(self.heading)
            if self.target is not None:
                d, b = distance_bearing(self.lat, self.lon, self.target[0], self.target[1])
                dist, brg = int(d), int(b)
            m.send(m.nav_controller_output_encode(0, 0, brg, brg, min(dist, 65535), 0, 0, 0))
        elif name == "HOME_POSITION":
            m.send(m.home_position_encode(int(self.home[0] * 1e7), int(self.home[1] * 1e7), int(self.home[2] * 1000), 0, 0, 0, [1, 0, 0, 0], 0, 0, 0))
        elif name == "RC_CHANNELS":
            m.send(m.rc_channels_encode(tb, 8, *([1500] * 8 + [0] * 10), 230))
        elif name == "FENCE_STATUS":
            m.send(m.fence_status_encode(0, 0, 0, 0))
        elif name == "WIND":
            m.send(m.wind_encode(270.0, 3.2, 0.0))
        elif name == "SYSTEM_TIME":
            m.send(m.system_time_encode(int(time.time() * 1e6), tb))
        elif name == "AUTOPILOT_VERSION":
            caps = (
                mavlink.MAV_PROTOCOL_CAPABILITY_MISSION_INT
                | mavlink.MAV_PROTOCOL_CAPABILITY_COMMAND_INT
                | mavlink.MAV_PROTOCOL_CAPABILITY_MAVLINK2
                | mavlink.MAV_PROTOCOL_CAPABILITY_MISSION_FENCE
                | mavlink.MAV_PROTOCOL_CAPABILITY_MISSION_RALLY
                | mavlink.MAV_PROTOCOL_CAPABILITY_PARAM_ENCODE_C_CAST
            )
            version = (4 << 24) | (5 << 16) | (7 << 8) | 255
            m.send(m.autopilot_version_encode(caps, version, 0, 0, 0, [0] * 8, [0] * 8, [0] * 8, 0, 0, 0))

    def _voltage(self) -> float:
        cells = 4 if self.vehicle == "copter" else 3
        return cells * (3.5 + 0.7 * self.battery_pct / 100.0)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vehicle", choices=("copter", "rover"), default="copter")
    ap.add_argument("--to", default="127.0.0.1:14550", help="companion udpin address")
    ap.add_argument("--home", default="25.0330,121.5654,12", help="lat,lon,alt(AMSL m)")
    ap.add_argument("--sysid", type=int, default=1)
    ap.add_argument("--speedup", type=float, default=1.0)
    ap.add_argument("--prearm-fail", default=None, help="make arming fail with this pre-arm reason")
    ap.add_argument("--no-gimbal", action="store_true")
    ap.add_argument("--payload", action="store_true", help="also simulate an ESP32 payload node (component 25)")
    ap.add_argument("--adsb", action="store_true", help="also simulate ADS-B traffic around home")
    args = ap.parse_args()
    host, port = args.to.rsplit(":", 1)
    lat, lon, alt = (float(x) for x in args.home.split(","))
    fake = FakeAutopilot((host, int(port)), vehicle=args.vehicle, home=(lat, lon, alt), sysid=args.sysid,
                         speedup=args.speedup, prearm_fail=args.prearm_fail, gimbal=not args.no_gimbal, payload=args.payload, adsb=args.adsb).start()
    print(f"fake {args.vehicle} (sysid {args.sysid}) sending to {args.to}; Ctrl+C to stop")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        fake.stop()


if __name__ == "__main__":
    main()
