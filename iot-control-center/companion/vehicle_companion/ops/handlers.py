"""What each command type does on the flight controller. Every handler returns
an ack dict; the executor adds lanes, timeouts, expiry and dedupe on top.

ArduPilot is the primary target. PX4 gets the standard-protocol subset (arm,
disarm, mode, RTL, land, missions); anything else answers UNSUPPORTED rather
than guessing at PX4 behaviour.
"""

from __future__ import annotations

import asyncio
import time
import logging
import math
from typing import Callable, Optional, Protocol

from ..mav.command import CommandClient, CommandResult
from ..mav.connection import MavConnection, NoVehicle
from ..mav.mission import MissionClient, mission_type_of
from ..mav.params import ParamClient, display_value
from ..mav.proto import mavlink
from ..mav.statustext import StatusLog
from ..mav.vehicle import ardupilot_modes, autopilot_family, is_armed, mode_name, px4_mode, vehicle_class

log = logging.getLogger(__name__)

MAV_CMD_NAV_RETURN_TO_LAUNCH = 20
MAV_CMD_NAV_LAND = 21
MAV_CMD_NAV_TAKEOFF = 22
MAV_CMD_DO_SET_MODE = 176
MAV_CMD_DO_CHANGE_SPEED = 178
MAV_CMD_DO_SET_HOME = 179
MAV_CMD_DO_REPOSITION = 192
MAV_CMD_DO_PAUSE_CONTINUE = 193
MAV_CMD_DO_SET_MISSION_CURRENT = 224
MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN = 246
MAV_CMD_MISSION_START = 300
MAV_CMD_COMPONENT_ARM_DISARM = 400
MAV_CMD_RUN_PREARM_CHECKS = 401
FORCE_MAGIC = 21196

FRAME_GLOBAL = mavlink.MAV_FRAME_GLOBAL
FRAME_GLOBAL_REL_ALT_INT = mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
# SET_POSITION_TARGET_GLOBAL_INT: use position only.
POSITION_ONLY_MASK = 0x0DF8


class MissionSource(Protocol):
    async def get_mission(self, mission_id: str) -> Optional[dict]: ...

    async def post_mission_download(self, command_id: str, items: list[dict], mission_type: int) -> bool: ...

    async def post_params(self, command_id: str, params: dict, fw: Optional[str]) -> bool: ...


class CommandFailed(Exception):
    def __init__(self, code: str, msg: str = ""):
        super().__init__(msg or code)
        self.code = code
        self.msg = msg


class Handlers:
    def __init__(
        self,
        conn: MavConnection,
        commands: CommandClient,
        missions: MissionClient,
        params: ParamClient,
        status: StatusLog,
        now_ms: Callable[[], int],
        *,
        mission_source: Optional[MissionSource] = None,
        mode_confirm_s: float = 3.0,
        video=None,
        gimbal=None,
        payload=None,
        dataflash=None,
        camera=None,
    ):
        self.conn = conn
        self.commands = commands
        self.missions = missions
        self.params = params
        self.status = status
        self.now_ms = now_ms
        self.mission_source = mission_source
        self.mode_confirm_s = mode_confirm_s
        self.video = video
        self.gimbal = gimbal
        self.payload = payload
        self.dataflash = dataflash
        self.camera = camera

    # ---- plumbing ------------------------------------------------------

    def ack(self, cmd_id: str, ok: bool, code: str, msg: str = "", res: Optional[dict] = None) -> dict:
        out = {"v": 1, "id": cmd_id, "st": "acked" if ok else "failed", "code": code, "t": self.now_ms()}
        if msg:
            out["msg"] = msg[:500]
        if res:
            out["res"] = res
        return out

    def _from_result(self, cmd_id: str, r: CommandResult, *, msg: str = "", res: Optional[dict] = None) -> dict:
        return self.ack(cmd_id, r.ok, r.code, msg, res)

    async def run(self, cmd: dict) -> dict:
        cmd_id = cmd.get("id", "")
        ctype = cmd.get("type", "")
        args = cmd.get("args") or {}
        fn = getattr(self, f"_h_{ctype}", None)
        if fn is None:
            return self.ack(cmd_id, False, "UNKNOWN_COMMAND", f"unknown type {ctype}")
        try:
            return await fn(cmd_id, args)
        except NoVehicle:
            return self.ack(cmd_id, False, "NO_VEHICLE", "no flight controller heartbeat")
        except CommandFailed as exc:
            return self.ack(cmd_id, False, exc.code, exc.msg)
        except (KeyError, TypeError, ValueError) as exc:
            return self.ack(cmd_id, False, "BAD_ARGS", str(exc))

    def _hb(self):
        hb = self.conn.heartbeat()
        if hb is None:
            raise NoVehicle()
        return hb

    def _family(self) -> str:
        return autopilot_family(self._hb().autopilot)

    def _texts_since(self, seq: int, prefixes: tuple[str, ...] = ()) -> str:
        texts = [e["text"] for e in self.status.since(seq) if not prefixes or e["text"].startswith(prefixes)]
        return "; ".join(texts[-5:])

    async def _wait_heartbeat(self, pred, timeout: float) -> bool:
        hb = self.conn.heartbeat()
        if hb is not None and pred(hb):
            return True
        tsys, tcomp = self.conn.target_ids()
        with self.conn.subscribe("HEARTBEAT", lambda m: (m.get_srcSystem(), m.get_srcComponent()) == (tsys, tcomp) and pred(m)) as sub:
            return await sub.get(timeout) is not None

    # ---- modes ---------------------------------------------------------

    async def set_mode(self, name: str) -> tuple[bool, str, str]:
        """Returns (ok, code, message)."""
        hb = self._hb()
        name = name.strip().upper()
        if not name:
            return False, "BAD_MODE", "no mode"
        seq = self.status._seq
        if autopilot_family(hb.autopilot) == "px4":
            mapping = px4_mode(name)
            if mapping is None:
                return False, "BAD_MODE", f"unknown PX4 mode {name}"
            base, main, sub = mapping
            r = await self.commands.command_long(MAV_CMD_DO_SET_MODE, [base, main, sub])
            want = lambda h: mode_name(h) == name  # noqa: E731
        else:
            modes = ardupilot_modes(hb.type)
            number = modes.get(name)
            if number is None:
                return False, "BAD_MODE", f"{name} is not a mode of this vehicle"
            r = await self.commands.command_long(MAV_CMD_DO_SET_MODE, [mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, number])
            if r.unsupported or r.result is None:
                # Older firmware only knows the SET_MODE message.
                tsys, _ = self.conn.target_ids()
                self.conn.send(self.conn.mav.set_mode_encode(tsys, mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, number))
            want = lambda h: h.custom_mode == number  # noqa: E731
        if r.ok:
            # ArduPilot only accepts DO_SET_MODE once the mode is entered; the
            # vehicle may already have moved on (RTL at home → LAND), so do
            # not insist on seeing it in a heartbeat.
            return True, r.code, ""
        if r.result is not None and not r.unsupported:
            return False, r.code, self._texts_since(seq) or f"could not enter {name}"
        if await self._wait_heartbeat(want, self.mode_confirm_s):
            return True, "MAV_RESULT_ACCEPTED", ""
        return False, "MODE_REJECTED", self._texts_since(seq) or f"could not enter {name}"

    async def _mode_cmd(self, cmd_id: str, name: str) -> dict:
        ok, code, msg = await self.set_mode(name)
        return self.ack(cmd_id, ok, code, msg, {"mode": name})

    def _hold_mode(self, hb) -> str:
        if autopilot_family(hb.autopilot) == "px4":
            return "LOITER"
        cls = vehicle_class(hb.type)
        if cls == "rover":
            return "HOLD"
        modes = ardupilot_modes(hb.type)
        return "BRAKE" if "BRAKE" in modes else "LOITER"

    # ---- handlers ------------------------------------------------------

    async def _h_set_mode(self, cmd_id: str, args: dict) -> dict:
        return await self._mode_cmd(cmd_id, str(args.get("mode", "")))

    async def _arm(self, cmd_id: str, arm: bool, force: bool) -> dict:
        self._hb()
        seq = self.status._seq
        r = await self.commands.command_long(MAV_CMD_COMPONENT_ARM_DISARM, [1 if arm else 0, FORCE_MAGIC if force else 0])
        msg = ""
        if not r.ok:
            await asyncio.sleep(0.3)  # the reason arrives as STATUSTEXT around the ack
            msg = self._texts_since(seq, ("Arm:", "PreArm:", "Disarm")) or "; ".join(self.status.prearm_failures())
        elif arm:
            self.status.clear_prearm()
        return self._from_result(cmd_id, r, msg=msg, res={"force": True} if force else None)

    async def _h_arm(self, cmd_id: str, args: dict) -> dict:
        return await self._arm(cmd_id, True, False)

    async def _h_disarm(self, cmd_id: str, args: dict) -> dict:
        return await self._arm(cmd_id, False, bool(args.get("force")))

    async def _h_rtl(self, cmd_id: str, args: dict) -> dict:
        if self._family() == "px4":
            return self._from_result(cmd_id, await self.commands.command_long(MAV_CMD_NAV_RETURN_TO_LAUNCH))
        return await self._mode_cmd(cmd_id, "RTL")

    async def _h_land(self, cmd_id: str, args: dict) -> dict:
        hb = self._hb()
        if autopilot_family(hb.autopilot) == "px4":
            return self._from_result(cmd_id, await self.commands.command_long(MAV_CMD_NAV_LAND))
        if vehicle_class(hb.type) == "rover":
            return self.ack(cmd_id, False, "UNSUPPORTED", "rovers do not land; use hold")
        return await self._mode_cmd(cmd_id, "LAND")

    async def _h_hold(self, cmd_id: str, args: dict) -> dict:
        return await self._mode_cmd(cmd_id, str(args.get("mode") or self._hold_mode(self._hb())))

    async def _h_takeoff(self, cmd_id: str, args: dict) -> dict:
        hb = self._hb()
        alt = float(args["alt"])
        if vehicle_class(hb.type) != "copter" or autopilot_family(hb.autopilot) != "ardupilot":
            return self.ack(cmd_id, False, "UNSUPPORTED", "takeoff is for ArduCopter")
        if mode_name(hb) != "GUIDED":
            ok, code, msg = await self.set_mode("GUIDED")
            if not ok:
                return self.ack(cmd_id, False, code, msg)
        if not is_armed(self._hb()):
            arm = await self._arm(cmd_id, True, False)
            if arm["st"] != "acked":
                arm["code"] = "NOT_ARMED" if arm["code"] == "MAV_RESULT_ACCEPTED" else arm["code"]
                return arm
        r = await self.commands.command_long(MAV_CMD_NAV_TAKEOFF, [0, 0, 0, 0, 0, 0, alt])
        return self._from_result(cmd_id, r, res={"alt": alt})

    async def _reposition(self, lat: float, lon: float, alt: float) -> tuple[bool, str]:
        """DO_REPOSITION over COMMAND_INT (what ArduPilot implements), falling
        back to a GUIDED position target for firmware that answers UNSUPPORTED."""
        r = await self.commands.command_int(
            MAV_CMD_DO_REPOSITION,
            frame=FRAME_GLOBAL_REL_ALT_INT,
            params=[-1, mavlink.MAV_DO_REPOSITION_FLAGS_CHANGE_MODE, 0, math.nan],
            lat=lat,
            lon=lon,
            alt=alt,
        )
        if r.ok:
            return True, r.code
        if not (r.unsupported or r.result is None):
            return False, r.code
        ok, code, _ = await self.set_mode("GUIDED")
        if not ok:
            return False, code
        tsys, tcomp = self.conn.target_ids()
        self.conn.send(
            self.conn.mav.set_position_target_global_int_encode(
                0, tsys, tcomp, FRAME_GLOBAL_REL_ALT_INT, POSITION_ONLY_MASK,
                int(round(lat * 1e7)), int(round(lon * 1e7)), float(alt),
                0, 0, 0, 0, 0, 0, 0, 0,
            )
        )
        return True, "SENT_UNCONFIRMED"

    async def _h_goto(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        lat, lon, alt = float(args["lat"]), float(args["lon"]), float(args.get("alt", 0))
        ok, code = await self._reposition(lat, lon, alt)
        return self.ack(cmd_id, ok, code, res={"lat": lat, "lon": lon, "alt": alt})

    async def _h_change_alt(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        gpi = self.conn.latest("GLOBAL_POSITION_INT", max_age=3.0)
        if gpi is None:
            return self.ack(cmd_id, False, "NO_POSITION", "no current position")
        alt = float(args["alt"])
        ok, code = await self._reposition(gpi.lat / 1e7, gpi.lon / 1e7, alt)
        return self.ack(cmd_id, ok, code, res={"alt": alt})

    async def _h_change_speed(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        speed = float(args["speed"])
        r = await self.commands.command_long(MAV_CMD_DO_CHANGE_SPEED, [1, speed, -1, 0])
        return self._from_result(cmd_id, r, res={"speed": speed})

    async def _h_mission_start(self, cmd_id: str, args: dict) -> dict:
        hb = self._hb()
        auto = "MISSION" if autopilot_family(hb.autopilot) == "px4" else "AUTO"
        if mode_name(hb) != auto:
            ok, code, msg = await self.set_mode(auto)
            if not ok:
                return self.ack(cmd_id, False, code, msg)
        r = await self.commands.command_long(MAV_CMD_MISSION_START, [0, 0])
        return self._from_result(cmd_id, r)

    async def _h_mission_pause(self, cmd_id: str, args: dict) -> dict:
        hb = self._hb()
        r = await self.commands.command_long(MAV_CMD_DO_PAUSE_CONTINUE, [0])
        if r.ok:
            return self._from_result(cmd_id, r)
        if r.unsupported or r.result is None:
            return await self._mode_cmd(cmd_id, self._hold_mode(hb))
        return self._from_result(cmd_id, r)

    async def _h_mission_resume(self, cmd_id: str, args: dict) -> dict:
        hb = self._hb()
        r = await self.commands.command_long(MAV_CMD_DO_PAUSE_CONTINUE, [1])
        if r.ok:
            return self._from_result(cmd_id, r)
        if r.unsupported or r.result is None:
            return await self._mode_cmd(cmd_id, "MISSION" if autopilot_family(hb.autopilot) == "px4" else "AUTO")
        return self._from_result(cmd_id, r)

    async def _h_mission_set_current(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        seq = int(args["seq"])
        r = await self.commands.command_long(MAV_CMD_DO_SET_MISSION_CURRENT, [seq, 0])
        if r.ok:
            return self._from_result(cmd_id, r, res={"seq": seq})
        if not (r.unsupported or r.result is None):
            return self._from_result(cmd_id, r)
        # Older firmware: the (now deprecated) MISSION_SET_CURRENT message,
        # confirmed by MISSION_CURRENT.
        tsys, tcomp = self.conn.target_ids()
        with self.conn.subscribe("MISSION_CURRENT", lambda m: m.get_srcSystem() == tsys and m.seq == seq) as sub:
            self.conn.send(self.conn.mav.mission_set_current_encode(tsys, tcomp, seq))
            ok = await sub.get(3.0) is not None
        return self.ack(cmd_id, ok, "MAV_RESULT_ACCEPTED" if ok else "TIMEOUT", res={"seq": seq})

    async def _h_set_home(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        if args.get("current"):
            r = await self.commands.command_long(MAV_CMD_DO_SET_HOME, [1])
            return self._from_result(cmd_id, r)
        lat, lon, alt = float(args["lat"]), float(args["lon"]), float(args.get("alt", 0))
        r = await self.commands.command_int(MAV_CMD_DO_SET_HOME, frame=FRAME_GLOBAL, params=[0], lat=lat, lon=lon, alt=alt)
        if r.unsupported or r.result is None:
            r = await self.commands.command_long(MAV_CMD_DO_SET_HOME, [0, 0, 0, 0, lat, lon, alt])
        return self._from_result(cmd_id, r, res={"lat": lat, "lon": lon, "alt": alt})

    async def _h_run_prearm(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        seq = self.status._seq
        r = await self.commands.command_long(MAV_CMD_RUN_PREARM_CHECKS)
        await asyncio.sleep(0.5)
        return self._from_result(cmd_id, r, msg=self._texts_since(seq, ("PreArm:",)))

    async def _h_reboot(self, cmd_id: str, args: dict) -> dict:
        if is_armed(self._hb()):
            return self.ack(cmd_id, False, "ARMED", "refusing to reboot an armed vehicle")
        r = await self.commands.command_long(MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN, [1])
        return self._from_result(cmd_id, r)

    # ---- missions ------------------------------------------------------

    async def _h_mission_upload(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        mtype = mission_type_of(args.get("mtype", 0))
        items = args.get("items")
        if items is None:
            if self.mission_source is None:
                return self.ack(cmd_id, False, "MISSION_FETCH_FAILED", "no mission source")
            data = await self.mission_source.get_mission(str(args.get("missionId", "")))
            if not data:
                return self.ack(cmd_id, False, "MISSION_FETCH_FAILED", "could not fetch mission")
            items = data.get("items", [])
        r = await self.missions.upload(items, mtype)
        code = r.code if not r.ok else "MAV_RESULT_ACCEPTED"
        return self.ack(cmd_id, r.ok, code if r.ok else f"MISSION_UPLOAD_FAILED:{r.code}", res={"n": len(items), "mtype": mtype})

    async def _h_mission_download(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        mtype = mission_type_of(args.get("mtype", 0))
        r = await self.missions.download(mtype)
        if not r.ok:
            return self.ack(cmd_id, False, f"MISSION_DOWNLOAD_FAILED:{r.code}")
        if not r.items:
            return self.ack(cmd_id, False, "MISSION_DOWNLOAD_EMPTY", "no items", {"n": 0, "mtype": mtype})
        if args.get("inline"):
            return self.ack(cmd_id, True, "MAV_RESULT_ACCEPTED", res={"n": len(r.items), "mtype": mtype, "items": r.items})
        if self.mission_source is None:
            return self.ack(cmd_id, False, "DOWNLOAD_POST_FAILED", "no mission source")
        ok = await self.mission_source.post_mission_download(cmd_id, r.items, mtype)
        return self.ack(cmd_id, ok, "MAV_RESULT_ACCEPTED" if ok else "DOWNLOAD_POST_FAILED", res={"n": len(r.items), "mtype": mtype})

    async def _h_mission_clear(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        mtype = mission_type_of(args.get("mtype", 0))
        r = await self.missions.clear(mtype)
        return self.ack(cmd_id, r.ok, "MAV_RESULT_ACCEPTED" if r.ok else f"MISSION_CLEAR_FAILED:{r.code}", res={"mtype": mtype})

    # ---- gimbal ----------------------------------------------------------

    def _gimbal(self):
        self._hb()
        if self.gimbal is None:
            raise CommandFailed("NO_GIMBAL", "gimbal control not available")
        return self.gimbal

    async def _h_gimbal_pitchyaw(self, cmd_id: str, args: dict) -> dict:
        g = self._gimbal()
        r = await g.pitch_yaw(float(args.get("pitch", 0)), float(args.get("yaw", 0)), bool(args.get("lock")))
        return self._from_result(cmd_id, r, res={"pitch": args.get("pitch"), "yaw": args.get("yaw")})

    async def _h_gimbal_mode(self, cmd_id: str, args: dict) -> dict:
        from .gimbal import MOUNT_MODES

        name = str(args.get("mode", ""))
        if name not in MOUNT_MODES:
            return self.ack(cmd_id, False, "BAD_ARGS", f"unknown gimbal mode {name}")
        return self._from_result(cmd_id, await self._gimbal().mode(name), res={"mode": name})

    async def _h_roi_location(self, cmd_id: str, args: dict) -> dict:
        g = self._gimbal()
        lat, lon, alt = float(args["lat"]), float(args["lon"]), float(args.get("alt", 0))
        return self._from_result(cmd_id, await g.roi(lat, lon, alt), res={"lat": lat, "lon": lon})

    async def _h_roi_none(self, cmd_id: str, args: dict) -> dict:
        return self._from_result(cmd_id, await self._gimbal().roi_none())

    # ---- payload ---------------------------------------------------------

    def _payload(self):
        self._hb()
        if self.payload is None:
            raise CommandFailed("NO_PAYLOAD", "payload control not available")
        return self.payload

    async def _h_payload_relay(self, cmd_id: str, args: dict) -> dict:
        r = await self._payload().relay(int(args["index"]), bool(args.get("on")), int(args.get("comp", 25)))
        return self._from_result(cmd_id, r, res={"index": args["index"], "on": bool(args.get("on"))})

    async def _h_payload_pulse(self, cmd_id: str, args: dict) -> dict:
        r = await self._payload().pulse(int(args["index"]), float(args.get("ms", 500)), int(args.get("comp", 25)))
        return self._from_result(cmd_id, r, res={"index": args["index"]})

    async def _h_payload_servo(self, cmd_id: str, args: dict) -> dict:
        r = await self._payload().servo(int(args["index"]), float(args["pwm"]), int(args.get("comp", 25)))
        return self._from_result(cmd_id, r, res={"index": args["index"], "pwm": args["pwm"]})

    # ---- video -----------------------------------------------------------

    async def _h_video_record(self, cmd_id: str, args: dict) -> dict:
        if self.video is None:
            return self.ack(cmd_id, False, "NO_VIDEO", "no [video] api_url in the companion config")
        on = bool(args.get("on"))
        ok, code = await self.video.set_recording(on)
        return self.ack(cmd_id, ok, code, res={"on": on})

    # ---- parameters ----------------------------------------------------

    async def _h_param_get(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        names = [str(n) for n in args["names"]][:50]
        got = await self.params.get_many(names)
        values = {n: (None if p is None else display_value(p.value, p.type)) for n, p in got.items()}
        missing = [n for n, v in values.items() if v is None]
        return self.ack(cmd_id, not missing, "OK" if not missing else "PARAM_NOT_FOUND", ", ".join(missing), {"params": values})

    # ---- MAVLink2 signing ----------------------------------------------------------

    async def _h_signing_apply(self, cmd_id: str, args: dict) -> dict:
        """Gives the autopilot the companion's signing key (enable) or a zero
        key (disable). From then on the autopilot refuses unsigned MAVLink on
        every port except USB and ports with MAVn_OPTIONS bit 0 set."""
        hb = self._hb()
        if is_armed(hb):
            return self.ack(cmd_id, False, "ARMED", "change signing on the ground")
        key = self.conn.signing_key
        enable = bool(args.get("enable"))
        if key is None:
            return self.ack(cmd_id, False, "NO_KEY", "set [signing] passphrase in the companion config first")
        sysid, compid = self.conn.target_ids()
        # 10 µs units since 2015-01-01, as MAVLink signing timestamps are.
        ts = int((time.time() - 1_420_070_400) * 100_000)
        self.conn.send(self.conn.mav.setup_signing_encode(sysid, compid, list(key if enable else bytes(32)), ts if enable else 0))
        return self.ack(cmd_id, True, "OK", "", {"enabled": enable})

    # ---- camera -----------------------------------------------------------------

    def _camera(self):
        if self.camera is None:
            raise CommandFailed("NO_CAMERA", "the companion camera is not enabled ([camera])")
        return self.camera

    async def _h_camera_capture(self, cmd_id: str, args: dict) -> dict:
        cam = self._camera()
        interval = float(args.get("interval", 0) or 0)
        count = int(args.get("count", 1) or 1)
        if interval > 0:
            cam.start_interval(interval, count if count > 1 else 0, "gcs")
            return self.ack(cmd_id, True, "OK", "", {"interval": interval})
        try:
            photo = await cam.capture("gcs")
        except Exception as exc:
            return self.ack(cmd_id, False, "CAPTURE_FAILED", str(exc)[:200])
        return self.ack(cmd_id, True, "OK", "", {"photo": photo.to_dict()})

    async def _h_camera_stop(self, cmd_id: str, args: dict) -> dict:
        self._camera().stop_interval()
        return self.ack(cmd_id, True, "OK")

    # ---- DataFlash logs ------------------------------------------------------

    def _logs(self):
        if self.dataflash is None:
            raise CommandFailed("NO_LOGS", "DataFlash download is not configured")
        if is_armed(self._hb()):
            raise CommandFailed("ARMED", "the autopilot only serves logs while disarmed")
        return self.dataflash

    async def _h_log_list(self, cmd_id: str, args: dict) -> dict:
        from ..mav.logs import LogError

        try:
            logs = await self._logs().list()
        except LogError as exc:
            return self.ack(cmd_id, False, exc.code, exc.msg)
        return self.ack(cmd_id, True, "OK", "", {"logs": logs})

    async def _h_log_download(self, cmd_id: str, args: dict) -> dict:
        """Copies one log to the companion; the browser then fetches it over the
        direct link's /files/logs. Progress is in the state (`logdl`)."""
        from ..mav.logs import LogError

        client = self._logs()
        try:
            path = await client.download(int(args["id"]), int(args["size"]), int(args.get("utc", 0)))
        except LogError as exc:
            return self.ack(cmd_id, False, exc.code, exc.msg)
        return self.ack(cmd_id, True, "OK", "", {"name": path.name, "bytes": path.stat().st_size})

    async def _h_log_cancel(self, cmd_id: str, args: dict) -> dict:
        if self.dataflash is None:
            return self.ack(cmd_id, False, "NO_LOGS", "DataFlash download is not configured")
        self.dataflash.cancel()
        return self.ack(cmd_id, True, "OK")

    async def _h_param_fetch(self, cmd_id: str, args: dict) -> dict:
        """The whole parameter table. Stored on the server as a snapshot (for
        history and Compare); returned inline too when asked (direct link)."""
        self._hb()
        table = await self.params.fetch_all()
        if not table:
            return self.ack(cmd_id, False, "PARAM_FETCH_FAILED", "no parameters received")
        compact = {name: [display_value(p.value, p.type), p.type] for name, p in table.items()}
        total = next(iter(table.values())).count
        complete = total == 0 or len(table) >= total
        res: dict = {"count": len(table), "total": total}
        stored = False
        if self.mission_source is not None:
            fw = None
            try:
                from ..mav.vehicle import firmware_string

                fw = firmware_string(self.conn.latest("AUTOPILOT_VERSION"), self.conn.heartbeat())
            except Exception:  # firmware string is a nicety
                pass
            stored = await self.mission_source.post_params(cmd_id, compact, fw)
        res["stored"] = stored
        if args.get("inline"):
            res["params"] = compact
        code = "OK" if complete else "PARAM_FETCH_INCOMPLETE"
        return self.ack(cmd_id, True, code, "" if complete else f"{len(table)}/{total}", res)

    async def _h_param_set(self, cmd_id: str, args: dict) -> dict:
        self._hb()
        wanted = dict(args["params"])
        if len(wanted) > 50:
            return self.ack(cmd_id, False, "BAD_ARGS", "at most 50 parameters per command")
        results = {}
        for name, value in wanted.items():
            r = await self.params.set(str(name), float(value))
            results[name] = {"ok": r.ok, "code": r.code, "value": r.value}
        failed = [n for n, r in results.items() if not r["ok"]]
        return self.ack(cmd_id, not failed, "OK" if not failed else "PARAM_SET_FAILED", ", ".join(failed), {"params": results})
