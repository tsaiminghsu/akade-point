"""AWS IoT Core MQTT subscriber for low-latency command push (transport "iot").
paho runs its own network thread; messages are handed to the asyncio loop.
Telemetry and acks still go over HTTPS, and the telemetry response remains the
fallback delivery path, so a broker outage only costs latency."""

from __future__ import annotations

import asyncio
import json
import logging
import ssl
from typing import Callable

log = logging.getLogger(__name__)


class MqttCommandClient:
    def __init__(self, cfg, loop: asyncio.AbstractEventLoop, on_command: Callable[[dict], None]):
        self.cfg = cfg
        self.loop = loop
        self.on_command = on_command
        self.client = None

    def start(self) -> None:
        import paho.mqtt.client as mqtt

        cfg = self.cfg
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=cfg.companion_id)
        self.client.tls_set(ca_certs=cfg.ca, certfile=cfg.cert, keyfile=cfg.key, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.connect_async(cfg.endpoint, cfg.port, keepalive=45)
        self.client.loop_start()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        client.subscribe(f"vehicles/{self.cfg.companion_id}/cmd", qos=1)
        log.info("mqtt connected (%s)", reason_code)

    def _on_message(self, client, userdata, message):
        try:
            cmd = json.loads(message.payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            log.warning("bad command payload: %s", exc)
            return
        self.loop.call_soon_threadsafe(self.on_command, cmd)

    def stop(self) -> None:
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()
