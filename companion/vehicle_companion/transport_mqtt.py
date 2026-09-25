"""AWS IoT Core MQTT subscriber for the command push. Only started in IoT mode;
telemetry and acks always go over HTTPS. Kept optional so the package imports
and runs (HTTP-only) without paho-mqtt installed."""

from __future__ import annotations

import json
import ssl
from typing import Callable


class MqttClient:
    def __init__(self, config, enqueue_command: Callable[[dict], None]):
        self.config = config
        self.enqueue_command = enqueue_command
        self.client = None

    def start(self) -> None:
        import paho.mqtt.client as mqtt

        cfg = self.config.mqtt
        # paho-mqtt 2.x requires an explicit callback API version.
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=cfg.companion_id)
        self.client.tls_set(ca_certs=cfg.ca, certfile=cfg.cert, keyfile=cfg.key, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.connect(cfg.endpoint, 8883, keepalive=45)
        self.client.loop_start()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        client.subscribe(f"vehicles/{self.config.mqtt.companion_id}/cmd", qos=1)
        print(f"[mqtt] connected ({reason_code})")

    def _on_message(self, client, userdata, message):
        try:
            cmd = json.loads(message.payload.decode("utf-8"))
            self.enqueue_command(cmd)
        except Exception as exc:
            print(f"[mqtt] bad command payload: {exc}")

    def stop(self) -> None:
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()
