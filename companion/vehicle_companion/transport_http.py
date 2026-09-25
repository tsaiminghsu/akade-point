"""HTTPS client for the device-side API. This is the single ingest path used in
both local and IoT modes (telemetry, ack, mission fetch/download); IoT mode only
adds the MQTT command push on top."""

from __future__ import annotations

import requests


class ApiClient:
    def __init__(self, base: str, token: str, timeout: float = 8.0):
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

    def post_telemetry(self, state: dict, history: list[dict] | None) -> dict | None:
        body: dict = {"state": state}
        if history:
            body["history"] = history
        try:
            r = self.session.post(f"{self.base}/api/device/vehicles/telemetry", json=body, timeout=self.timeout)
            if r.status_code == 200:
                return r.json()
            print(f"[http] telemetry {r.status_code}: {r.text[:120]}")
        except requests.RequestException as exc:
            print(f"[http] telemetry error: {exc}")
        return None

    def post_ack(self, command_id: str, ack: dict) -> bool:
        try:
            r = self.session.post(
                f"{self.base}/api/device/vehicles/commands/{command_id}/ack", json=ack, timeout=self.timeout
            )
            return r.status_code == 200
        except requests.RequestException as exc:
            print(f"[http] ack error: {exc}")
            return False

    def get_mission(self, mission_id: str) -> dict | None:
        try:
            r = self.session.get(f"{self.base}/api/device/vehicles/missions/{mission_id}", timeout=self.timeout)
            if r.status_code == 200:
                return r.json().get("mission")
        except requests.RequestException as exc:
            print(f"[http] get_mission error: {exc}")
        return None

    def post_mission_download(self, command_id: str, items: list[dict]) -> bool:
        try:
            r = self.session.post(
                f"{self.base}/api/device/vehicles/missions/download",
                json={"commandId": command_id, "items": items},
                timeout=self.timeout,
            )
            return r.status_code == 200
        except requests.RequestException as exc:
            print(f"[http] mission download error: {exc}")
            return False
