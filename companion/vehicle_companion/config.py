"""Companion configuration loaded from a TOML file (Python 3.11+ tomllib)."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Optional


@dataclass
class MqttConfig:
    endpoint: str = ""
    port: int = 8883
    companion_id: str = ""
    cert: str = ""
    key: str = ""
    ca: str = ""

    @property
    def enabled(self) -> bool:
        return bool(self.endpoint and self.cert and self.key and self.ca)


@dataclass
class DirectConfig:
    """Browser ⇄ companion WebSocket link (contract v2)."""

    enabled: bool = False
    host: str = "0.0.0.0"
    port: int = 8765
    # Secret shared with the Control Center; tickets it issues are HMAC-signed
    # with it. Printed once when the device token is generated.
    ticket_key: str = ""
    # Optional PIN for field use without the Control Center.
    pin: str = ""
    # Page origins allowed to open the socket, e.g. "https://cc.example.com".
    # Empty = accept any origin (ticket/PIN still required).
    allowed_origins: list[str] = field(default_factory=list)


@dataclass
class VideoConfig:
    """MediaMTX control API on the Pi (stream status and recording)."""

    api_url: str = ""
    path: str = "cam"

    @property
    def enabled(self) -> bool:
        return bool(self.api_url)


@dataclass
class CameraConfig:
    """The companion as a MAVLink camera (ops/camera.py)."""

    enabled: bool = False
    #: rtsp (a frame from MediaMTX's stream), rpicam (rpicam-still) or test
    source: str = "rtsp"
    rtsp_url: str = "rtsp://127.0.0.1:8554/cam"
    photos_dir: str = "photos"
    model: str = "Raspberry Pi Camera Module 3"
    #: lens and sensor for CAMERA_INFORMATION (Camera Module 3 defaults)
    focal_mm: float = 4.74
    sensor_w_mm: float = 6.45
    sensor_h_mm: float = 3.63
    width: int = 4608
    height: int = 2592


@dataclass
class TerrainConfig:
    """Terrain for the autopilot from SRTM tiles (terrain/server.py)."""

    enabled: bool = False
    dir: str = "terrain"
    #: fetch missing tiles from ArduPilot's terrain server when online
    download: bool = False
    server: str = "https://terrain.ardupilot.org/SRTM1"


@dataclass
class UploadConfig:
    """Photos and logs to the cloud (links/uploader.py)."""

    enabled: bool = False
    photos: bool = True
    #: telemetry logs: "off", "flights" (armed periods only) or "all"
    tlogs: str = "flights"
    #: DataFlash logs downloaded from the autopilot
    dataflash: bool = True
    #: send logs while armed too (photos always go)
    logs_while_armed: bool = False
    #: uplink cap in kbit/s, 0 = none
    max_kbps: float = 0.0
    #: what has been uploaded, so a restart does not send it again
    state_file: str = "upload-state.json"


@dataclass
class SigningConfig:
    """MAVLink2 signing. The key is SHA-256 of the passphrase, as Mission
    Planner and QGroundControl derive it, so the same passphrase works there."""

    passphrase: str = ""

    @property
    def key(self) -> Optional[bytes]:
        import hashlib

        return hashlib.sha256(self.passphrase.encode()).digest() if self.passphrase else None


@dataclass
class RemoteIdConfig:
    """Remote ID module (ArduRemoteID). send_operator_location sends
    OPEN_DRONE_ID_SYSTEM with the takeoff position as operator location."""

    send_operator_location: bool = False


@dataclass
class Config:
    vehicle_id: str
    api_base: str
    token: str
    # "http" (commands ride on telemetry responses) or "iot" (also MQTT push).
    transport: str = "http"
    # Device API contract version the server speaks (1 = legacy, 2 = GCS).
    contract: int = 1
    # How to reach the flight controller. With mavlink-router on the Pi use its
    # companion endpoint, e.g. "udpin:127.0.0.1:14540"; direct serial is
    # "/dev/serial0" (then set baud).
    mavlink_url: str = "udpin:127.0.0.1:14550"
    baud: int = 921600
    # Our MAVLink identity. 253 avoids the autopilot (1) and Mission Planner (255).
    source_system: int = 253
    # Pin the vehicle's sysid; default = first autopilot heartbeat seen.
    target_system: Optional[int] = None
    # GCS heartbeat policy: "off" | "always" | "operator" (see mav/heartbeat.py).
    gcs_heartbeat: str = "off"
    # Series cell count, for per-cell voltage from an analog power module.
    battery_cells: int = 0
    telemetry_interval_s: float = 1.0
    # One history point every N seconds.
    history_every_s: float = 5.0
    # History point spacing while armed (the ground station's flight replay).
    history_armed_s: float = 2.0
    # Telemetry logs; empty disables recording.
    tlog_dir: str = "tlogs"
    tlog_max_mb: int = 2048
    # DataFlash logs copied from the autopilot (log_download); served on /files/logs.
    dataflash_dir: str = "dataflash"
    log_level: str = "INFO"
    mqtt: MqttConfig = field(default_factory=MqttConfig)
    direct: DirectConfig = field(default_factory=DirectConfig)
    video: VideoConfig = field(default_factory=VideoConfig)
    remote_id: RemoteIdConfig = field(default_factory=RemoteIdConfig)
    camera: CameraConfig = field(default_factory=CameraConfig)
    signing: SigningConfig = field(default_factory=SigningConfig)
    terrain: TerrainConfig = field(default_factory=TerrainConfig)
    upload: UploadConfig = field(default_factory=UploadConfig)

    @staticmethod
    def from_dict(data: dict) -> "Config":
        known = {f.name for f in fields(Config)}
        if data.get("forward_udp"):
            raise ValueError(
                "forward_udp was removed: run mavlink-router on the Pi and point Mission Planner at it "
                "(see companion/deploy/mavlink-router.conf)"
            )
        unknown = set(data) - known - {"forward_udp"}
        if unknown:
            raise ValueError(f"unknown config keys: {', '.join(sorted(unknown))}")
        kwargs = {k: v for k, v in data.items() if k in known and k not in ("mqtt", "direct", "video", "remote_id", "camera", "signing", "terrain", "upload")}
        cfg = Config(**kwargs)
        cfg.api_base = cfg.api_base.rstrip("/")
        cfg.mqtt = MqttConfig(**data.get("mqtt", {}))
        cfg.direct = DirectConfig(**data.get("direct", {}))
        cfg.video = VideoConfig(**data.get("video", {}))
        cfg.remote_id = RemoteIdConfig(**data.get("remote_id", {}))
        cfg.camera = CameraConfig(**data.get("camera", {}))
        cfg.signing = SigningConfig(**data.get("signing", {}))
        cfg.terrain = TerrainConfig(**data.get("terrain", {}))
        cfg.upload = UploadConfig(**data.get("upload", {}))
        if cfg.upload.tlogs not in ("off", "flights", "all"):
            raise ValueError("upload.tlogs must be off, flights or all")
        if cfg.signing.passphrase and len(cfg.signing.passphrase) < 12:
            raise ValueError("signing.passphrase must be at least 12 characters")
        if cfg.camera.source not in ("rtsp", "rpicam", "test"):
            raise ValueError("camera.source must be rtsp, rpicam or test")
        if cfg.gcs_heartbeat not in ("off", "always", "operator"):
            raise ValueError("gcs_heartbeat must be off, always or operator")
        if cfg.transport not in ("http", "iot"):
            raise ValueError("transport must be http or iot")
        return cfg

    @staticmethod
    def load(path: str | Path) -> "Config":
        with open(path, "rb") as f:
            return Config.from_dict(tomllib.load(f))
