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
    # Telemetry logs; empty disables recording.
    tlog_dir: str = "tlogs"
    tlog_max_mb: int = 2048
    log_level: str = "INFO"
    mqtt: MqttConfig = field(default_factory=MqttConfig)
    direct: DirectConfig = field(default_factory=DirectConfig)

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
        kwargs = {k: v for k, v in data.items() if k in known and k not in ("mqtt", "direct")}
        cfg = Config(**kwargs)
        cfg.api_base = cfg.api_base.rstrip("/")
        cfg.mqtt = MqttConfig(**data.get("mqtt", {}))
        cfg.direct = DirectConfig(**data.get("direct", {}))
        if cfg.gcs_heartbeat not in ("off", "always", "operator"):
            raise ValueError("gcs_heartbeat must be off, always or operator")
        if cfg.transport not in ("http", "iot"):
            raise ValueError("transport must be http or iot")
        return cfg

    @staticmethod
    def load(path: str | Path) -> "Config":
        with open(path, "rb") as f:
            return Config.from_dict(tomllib.load(f))
