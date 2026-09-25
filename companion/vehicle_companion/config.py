"""Companion configuration loaded from a TOML file (Python 3.11+ tomllib)."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class MqttConfig:
    endpoint: str = ""
    companion_id: str = ""
    cert: str = ""
    key: str = ""
    ca: str = ""

    @property
    def enabled(self) -> bool:
        return bool(self.endpoint and self.cert and self.key and self.ca)


@dataclass
class Config:
    vehicle_id: str
    api_base: str
    token: str
    # "http" (HTTPS only, local dev) or "iot" (also subscribe to MQTT commands).
    transport: str = "http"
    mavlink_url: str = "udpin:127.0.0.1:14550"
    # MAVLink source system for our own sends; 253 avoids colliding with
    # MissionPlanner (255) and the flight controller (1).
    source_system: int = 253
    telemetry_interval_s: float = 1.0
    # Store one history point every N seconds (downsampling for the history table).
    history_every_s: float = 5.0
    # UDP endpoints to fan MAVLink out to, e.g. MissionPlanner on a laptop.
    forward_udp: list[str] = field(default_factory=list)
    mqtt: MqttConfig = field(default_factory=MqttConfig)

    @staticmethod
    def load(path: str | Path) -> "Config":
        with open(path, "rb") as f:
            data = tomllib.load(f)
        mqtt = MqttConfig(**data.get("mqtt", {}))
        return Config(
            vehicle_id=data["vehicle_id"],
            api_base=data["api_base"].rstrip("/"),
            token=data["token"],
            transport=data.get("transport", "http"),
            mavlink_url=data.get("mavlink_url", "udpin:127.0.0.1:14550"),
            source_system=int(data.get("source_system", 253)),
            telemetry_interval_s=float(data.get("telemetry_interval_s", 1.0)),
            history_every_s=float(data.get("history_every_s", 5.0)),
            forward_udp=list(data.get("forward_udp", [])),
            mqtt=mqtt,
        )
