"""Wires the pieces together and runs the command loop. Commands arrive from two
sources onto one queue: the telemetry-POST response (always) and MQTT (IoT mode
only)."""

from __future__ import annotations

import queue
import signal
import time

from .commands import CommandExecutor
from .config import Config
from .forwarder import UdpForwarder
from .mavlink_link import MavlinkLink
from .telemetry import TelemetryPublisher
from .transport_http import ApiClient


def run(config: Config) -> None:
    command_queue: "queue.Queue[dict]" = queue.Queue()

    link = MavlinkLink(config.mavlink_url, source_system=config.source_system)
    print(f"[main] connecting to {config.mavlink_url} …")
    link.start()
    print("[main] waiting for heartbeat …")
    link.wait_heartbeat(timeout=60)
    print("[main] heartbeat received")

    forwarder = UdpForwarder(link, config.forward_udp)
    forwarder.start()
    if config.forward_udp:
        print(f"[main] forwarding MAVLink to {', '.join(config.forward_udp)}")

    api = ApiClient(config.api_base, config.token)
    publisher = TelemetryPublisher(link, api, config, command_queue.put)
    publisher.start()

    mqtt_client = None
    if config.transport == "iot" and config.mqtt.enabled:
        from .transport_mqtt import MqttClient

        mqtt_client = MqttClient(config, command_queue.put)
        mqtt_client.start()
        print("[main] MQTT command channel active")
    else:
        print("[main] HTTP transport: commands arrive via telemetry responses")

    executor = CommandExecutor(link, api, config)

    running = True

    def shutdown(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("[main] running")
    while running:
        try:
            cmd = command_queue.get(timeout=0.5)
        except queue.Empty:
            continue
        print(f"[main] executing {cmd.get('type')} ({cmd.get('id')})")
        ack = executor.execute(cmd)
        print(f"[main] -> {ack['st']} {ack['code']}")

    publisher.stop()
    forwarder.stop()
    if mqtt_client is not None:
        mqtt_client.stop()
    link.stop()
    time.sleep(0.5)
    print("[main] stopped")
