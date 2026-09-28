"""The companion as a MAVLink camera (Camera Protocol v2).

The Pi's camera appears on the vehicle's MAVLink network as component 100
of the vehicle's system, like a gimbal (154) or the ESP32 payload node (25).
It announces itself with a MAV_TYPE_CAMERA heartbeat, answers the autopilot's
requests (CAMERA_INFORMATION, STORAGE_INFORMATION, capture status) and takes
photos on MAV_CMD_IMAGE_START_CAPTURE or DO_DIGICAM_CONTROL. With ArduPilot's
CAM1_TYPE = 6 (MAVLinkCamV2) a mission's DO_SET_CAM_TRIGG_DIST therefore
takes survey photos. The ground station can also shoot directly
(camera_capture).

Every photo is geotagged in EXIF with where the vehicle was when the shot was
asked for, logged in `<photos_dir>/index.jsonl`, reported back with
CAMERA_IMAGE_CAPTURED and served to the browser on the direct link.

Capture sources:
* rtsp   — one frame from MediaMTX's stream with ffmpeg (works while streaming)
* rpicam — rpicam-still (only when nothing else holds the camera)
* test   — a built-in frame, for SITL and tests
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import shutil
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from ..mav.connection import MavConnection
from ..mav.proto import mavlink
from ..media.exif import Geotag, geotag_jpeg
from ..media.test_frame import TEST_FRAME

log = logging.getLogger(__name__)

CAMERA_COMP = mavlink.MAV_COMP_ID_CAMERA  # 100
MAV_CMD_DO_DIGICAM_CONTROL = 203
MAV_CMD_REQUEST_MESSAGE = 512
MAV_CMD_REQUEST_CAMERA_INFORMATION = 521
MAV_CMD_REQUEST_CAMERA_SETTINGS = 522
MAV_CMD_REQUEST_STORAGE_INFORMATION = 525
MAV_CMD_REQUEST_CAMERA_CAPTURE_STATUS = 527
MAV_CMD_IMAGE_START_CAPTURE = 2000
MAV_CMD_IMAGE_STOP_CAPTURE = 2001
MAV_CMD_REQUEST_CAMERA_IMAGE_CAPTURE = 2002
CAP_FLAGS = mavlink.CAMERA_CAP_FLAGS_CAPTURE_IMAGE
NAME_RE = re.compile(r"^IMG_\d{5}_[0-9TZ]+\.jpg$")


@dataclass
class Photo:
    idx: int
    name: str
    t: int  # UTC ms of the trigger
    lat: Optional[float]
    lon: Optional[float]
    alt: Optional[float]
    rel: Optional[float]
    hdg: Optional[float]
    trigger: str

    def to_dict(self) -> dict:
        return dict(self.__dict__)


# ---- capture sources ---------------------------------------------------------


async def _run(cmd: list[str], timeout: float) -> None:
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    try:
        _, err = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"{cmd[0]} timed out")
    if proc.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(err or b'').decode(errors='replace')[-200:]}")


class RtspCapture:
    def __init__(self, url: str, ffmpeg: str = "ffmpeg"):
        self.url = url
        self.ffmpeg = ffmpeg

    async def grab(self) -> bytes:
        tmp = Path(os.environ.get("TMPDIR", "/tmp")) / f"akade-cap-{os.getpid()}.jpg"
        await _run([self.ffmpeg, "-loglevel", "error", "-y", "-rtsp_transport", "tcp", "-i", self.url, "-frames:v", "1", "-q:v", "2", str(tmp)], 15)
        try:
            return tmp.read_bytes()
        finally:
            tmp.unlink(missing_ok=True)


class RpicamCapture:
    def __init__(self, width: int = 0, height: int = 0):
        self.width = width
        self.height = height

    async def grab(self) -> bytes:
        tmp = Path(os.environ.get("TMPDIR", "/tmp")) / f"akade-still-{os.getpid()}.jpg"
        cmd = ["rpicam-still", "-n", "--immediate", "-t", "1", "-o", str(tmp)]
        if self.width and self.height:
            cmd += ["--width", str(self.width), "--height", str(self.height)]
        await _run(cmd, 20)
        try:
            return tmp.read_bytes()
        finally:
            tmp.unlink(missing_ok=True)


class TestCapture:
    async def grab(self) -> bytes:
        await asyncio.sleep(0.05)
        return TEST_FRAME


# ---- the camera component --------------------------------------------------------


class CameraComponent:
    def __init__(
        self,
        conn: MavConnection,
        source,
        photos_dir: str | Path,
        *,
        model: str = "Raspberry Pi Camera",
        focal_mm: float = 4.74,
        sensor_mm: tuple[float, float] = (6.45, 3.63),
        resolution: tuple[int, int] = (4608, 2592),
        utc_ms: Callable[[], int] = lambda: int(time.time() * 1000),
    ):
        self.conn = conn
        self.source = source
        self.dir = Path(photos_dir)
        self.model = model
        self.focal_mm = focal_mm
        self.sensor_mm = sensor_mm
        self.resolution = resolution
        self.utc_ms = utc_ms
        self.boot = time.monotonic()
        self.photos: list[Photo] = self._load_index()
        self.busy = False
        self.error: Optional[str] = None
        self._interval_task: Optional[asyncio.Task] = None
        self._interval_s = 0.0
        self._mav = None
        self._mav_sys: Optional[int] = None
        self._lock = asyncio.Lock()

    # ---- MAVLink identity ----------------------------------------------------------

    def _encoder(self):
        """An encoder with the camera's ids: the vehicle's system, component 100."""
        target = self.conn.target
        if target is None:
            return None
        if self._mav is None or self._mav_sys != target[0]:
            self._mav = mavlink.MAVLink(None, srcSystem=target[0], srcComponent=CAMERA_COMP)
            self._mav_sys = target[0]
        # Sign like the rest of the companion when MAVLink2 signing is on.
        signing = self.conn.signing_state()
        if signing is not None:
            self._mav.signing = signing
        return self._mav

    def _send(self, build) -> None:
        mav = self._encoder()
        if mav is None:
            return
        self.conn.send_raw(build(mav).pack(mav))

    def _ms(self) -> int:
        return int((time.monotonic() - self.boot) * 1000) & 0xFFFFFFFF

    async def run(self) -> None:
        """Heartbeat, as every MAVLink component does, so the autopilot finds us."""
        self.dir.mkdir(parents=True, exist_ok=True)
        while True:
            self._send(lambda m: m.heartbeat_encode(mavlink.MAV_TYPE_CAMERA, mavlink.MAV_AUTOPILOT_INVALID, 0, 0, mavlink.MAV_STATE_ACTIVE))
            await asyncio.sleep(1.0)

    # ---- inbound commands ------------------------------------------------------------

    def on_command(self, msg) -> None:
        """COMMAND_LONG listener: only commands addressed to the camera."""
        target = self.conn.target
        if target is None or msg.target_system != target[0] or msg.target_component != CAMERA_COMP:
            return
        asyncio.get_running_loop().create_task(self._handle(msg))

    async def _handle(self, msg) -> None:
        cmd = int(msg.command)
        R = mavlink
        result = R.MAV_RESULT_ACCEPTED
        if cmd in (MAV_CMD_REQUEST_MESSAGE,):
            result = self._send_requested(int(msg.param1), msg)
        elif cmd == MAV_CMD_REQUEST_CAMERA_INFORMATION:
            self._send_information()
        elif cmd == MAV_CMD_REQUEST_CAMERA_SETTINGS:
            self._send_settings()
        elif cmd == MAV_CMD_REQUEST_STORAGE_INFORMATION:
            self._send_storage()
        elif cmd == MAV_CMD_REQUEST_CAMERA_CAPTURE_STATUS:
            self._send_status()
        elif cmd == MAV_CMD_IMAGE_START_CAPTURE:
            interval, total = float(msg.param2), int(msg.param3)
            if total == 1 or interval <= 0:
                asyncio.get_running_loop().create_task(self.capture("autopilot"))
            else:
                self.start_interval(interval, total, "autopilot")
        elif cmd == MAV_CMD_IMAGE_STOP_CAPTURE:
            self.stop_interval()
        elif cmd == MAV_CMD_DO_DIGICAM_CONTROL:
            if int(msg.param5) == 1:
                asyncio.get_running_loop().create_task(self.capture("autopilot"))
        elif cmd == MAV_CMD_REQUEST_CAMERA_IMAGE_CAPTURE:
            photo = next((p for p in self.photos if p.idx == int(msg.param1)), None)
            if photo is None:
                result = R.MAV_RESULT_DENIED
            else:
                self._send_captured(photo)
        else:
            result = R.MAV_RESULT_UNSUPPORTED
        src_sys, src_comp = msg.get_srcSystem(), msg.get_srcComponent()
        self._send(lambda m: m.command_ack_encode(cmd, result, 0, 0, src_sys, src_comp))

    def _send_requested(self, msg_id: int, msg) -> int:
        R = mavlink
        if msg_id == R.MAVLINK_MSG_ID_CAMERA_INFORMATION:
            self._send_information()
        elif msg_id == R.MAVLINK_MSG_ID_CAMERA_SETTINGS:
            self._send_settings()
        elif msg_id == R.MAVLINK_MSG_ID_STORAGE_INFORMATION:
            self._send_storage()
        elif msg_id == R.MAVLINK_MSG_ID_CAMERA_CAPTURE_STATUS:
            self._send_status()
        elif msg_id == R.MAVLINK_MSG_ID_CAMERA_IMAGE_CAPTURED:
            photo = next((p for p in self.photos if p.idx == int(msg.param2)), None)
            if photo is None:
                return R.MAV_RESULT_DENIED
            self._send_captured(photo)
        else:
            return R.MAV_RESULT_UNSUPPORTED
        return R.MAV_RESULT_ACCEPTED

    # ---- outbound reports --------------------------------------------------------------

    def _send_information(self) -> None:
        self._send(
            lambda m: m.camera_information_encode(
                self._ms(), b"Raspberry Pi".ljust(32, b"\x00"), self.model.encode()[:32].ljust(32, b"\x00"), 0,
                self.focal_mm, self.sensor_mm[0], self.sensor_mm[1], self.resolution[0], self.resolution[1],
                0, CAP_FLAGS, 0, b"", 0, 0,
            )
        )

    def _send_settings(self) -> None:
        self._send(lambda m: m.camera_settings_encode(self._ms(), mavlink.CAMERA_MODE_IMAGE, math.nan, math.nan, 0))

    def _free_mib(self) -> float:
        try:
            return shutil.disk_usage(self.dir).free / 1048576
        except OSError:
            return 0.0

    def _send_storage(self) -> None:
        try:
            total = shutil.disk_usage(self.dir).total / 1048576
        except OSError:
            total = 0.0
        free = self._free_mib()
        self._send(lambda m: m.storage_information_encode(self._ms(), 1, 1, mavlink.STORAGE_STATUS_READY, total, total - free, free, math.nan, math.nan, 0, b"", 0))

    def _send_status(self) -> None:
        image_status = 3 if self._interval_task else (1 if self.busy else 0)
        self._send(lambda m: m.camera_capture_status_encode(self._ms(), image_status, 0, self._interval_s, 0, self._free_mib(), len(self.photos), 0))

    def _send_captured(self, p: Photo) -> None:
        att = self.conn.latest("ATTITUDE", max_age=3.0)
        q = _quaternion(att.roll, att.pitch, att.yaw) if att is not None else [1.0, 0.0, 0.0, 0.0]
        self._send(
            lambda m: m.camera_image_captured_encode(
                self._ms(), p.t * 1000, 0,
                int((p.lat or 0) * 1e7), int((p.lon or 0) * 1e7), int((p.alt or 0) * 1000), int((p.rel or 0) * 1000),
                q, p.idx, 1, f"/files/photos/{p.name}".encode()[:205],
            )
        )

    # ---- capturing ------------------------------------------------------------------------

    def _where(self) -> dict:
        gpi = self.conn.latest("GLOBAL_POSITION_INT", max_age=3.0)
        if gpi is None or (gpi.lat == 0 and gpi.lon == 0):
            return {"lat": None, "lon": None, "alt": None, "rel": None, "hdg": None}
        return {
            "lat": gpi.lat / 1e7,
            "lon": gpi.lon / 1e7,
            "alt": round(gpi.alt / 1000.0, 2),
            "rel": round(gpi.relative_alt / 1000.0, 2),
            "hdg": None if gpi.hdg == 65535 else gpi.hdg / 100.0,
        }

    async def capture(self, trigger: str = "gcs") -> Photo:
        """Takes one photo. The geotag is where the vehicle was when asked, not
        after the capture's latency."""
        where = self._where()
        t = self.utc_ms()
        async with self._lock:
            self.busy = True
            try:
                jpeg = await self.source.grab()
                self.error = None
            except Exception as exc:
                self.error = str(exc)[:120]
                log.warning("capture failed: %s", exc)
                raise
            finally:
                self.busy = False
            idx = (self.photos[-1].idx + 1) if self.photos else 1
            when = datetime.fromtimestamp(t / 1000, tz=timezone.utc)
            name = f"IMG_{idx:05d}_{when.strftime('%Y%m%dT%H%M%SZ')}.jpg"
            photo = Photo(idx=idx, name=name, t=t, trigger=trigger, **where)
            if photo.lat is not None:
                jpeg = geotag_jpeg(
                    jpeg,
                    Geotag(lat=photo.lat, lon=photo.lon, alt=photo.alt, when=when, heading=photo.hdg),
                    make="Raspberry Pi",
                    model=self.model,
                    description=f"akade {name}",
                )
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / name).write_bytes(jpeg)
            with open(self.dir / "index.jsonl", "a", encoding="utf-8") as fh:
                fh.write(json.dumps(photo.to_dict()) + "\n")
            self.photos.append(photo)
        self._send_captured(photo)
        return photo

    def start_interval(self, interval_s: float, total: int, trigger: str = "gcs") -> None:
        self.stop_interval()
        self._interval_s = max(0.5, interval_s)

        async def loop():
            n = 0
            try:
                while total <= 0 or n < total:
                    try:
                        await self.capture(trigger)
                    except Exception:
                        pass
                    n += 1
                    if total > 0 and n >= total:
                        break
                    await asyncio.sleep(self._interval_s)
            finally:
                self._interval_task = None
                self._interval_s = 0.0

        self._interval_task = asyncio.get_running_loop().create_task(loop())

    def stop_interval(self) -> None:
        if self._interval_task is not None:
            self._interval_task.cancel()
            self._interval_task = None
        self._interval_s = 0.0

    # ---- files ---------------------------------------------------------------------------------

    def _load_index(self) -> list[Photo]:
        path = self.dir / "index.jsonl"
        out: list[Photo] = []
        if path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    out.append(Photo(**json.loads(line)))
                except (ValueError, TypeError):
                    continue
        return out

    def list_photos(self, limit: int = 500) -> list[dict]:
        return [p.to_dict() for p in self.photos[-limit:]][::-1]

    def resolve(self, name: str) -> Optional[Path]:
        if os.path.basename(name) != name or not NAME_RE.match(name):
            return None
        p = self.dir / name
        return p if p.is_file() else None

    def state_block(self) -> dict:
        last = self.photos[-1] if self.photos else None
        return {
            "n": len(self.photos),
            "busy": self.busy,
            "interval": self._interval_s or None,
            "error": self.error,
            "last": None if last is None else {"idx": last.idx, "name": last.name, "t": last.t, "lat": last.lat, "lon": last.lon},
        }


def _quaternion(roll: float, pitch: float, yaw: float) -> list[float]:
    cr, sr = math.cos(roll / 2), math.sin(roll / 2)
    cp, sp = math.cos(pitch / 2), math.sin(pitch / 2)
    cy, sy = math.cos(yaw / 2), math.sin(yaw / 2)
    return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy]
