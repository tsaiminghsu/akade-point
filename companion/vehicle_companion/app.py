"""Wires the companion together and runs it until SIGINT/SIGTERM."""

from __future__ import annotations

import asyncio
import logging
import signal
from dataclasses import dataclass
from typing import Optional

from .clock import Clock
from .config import Config
from .links.cloud import CloudLink
from .mav.command import CommandClient
from .mav.connection import MavConnection
from .mav.heartbeat import GcsHeartbeat
from .mav.mission import MissionClient
from .mav.params import ParamClient
from .mav.statustext import StatusLog
from .mav.streams import StreamManager
from .ops.executor import Executor
from .ops.handlers import Handlers
from .state import StateBuilder
from .sysinfo import SysInfo
from .tlog import TlogWriter

log = logging.getLogger("vehicle_companion")


@dataclass
class Companion:
    """Everything a running companion holds; the direct link and tests reach
    in through this."""

    config: Config
    clock: Clock
    conn: MavConnection
    commands: CommandClient
    missions: MissionClient
    params: ParamClient
    status: StatusLog
    streams: StreamManager
    sysinfo: SysInfo
    builder: StateBuilder
    cloud: CloudLink
    handlers: Handlers
    executor: Executor
    heartbeat: GcsHeartbeat
    tlog: Optional[TlogWriter] = None


def build(config: Config) -> Companion:
    clock = Clock()
    tlog = TlogWriter(config.tlog_dir, max_total_mb=config.tlog_max_mb) if config.tlog_dir else None
    conn = MavConnection(
        config.mavlink_url,
        baud=config.baud,
        source_system=config.source_system,
        target_system=config.target_system,
        tlog=tlog,
    )
    commands = CommandClient(conn)
    missions = MissionClient(conn)
    params = ParamClient(conn)
    status = StatusLog(clock.now_ms)
    streams = StreamManager(conn, commands)
    sysinfo = SysInfo()
    cloud = CloudLink(
        config.api_base,
        config.token,
        clock,
        contract=config.contract,
        telemetry_interval_s=config.telemetry_interval_s,
        history_every_s=config.history_every_s,
    )
    heartbeat = GcsHeartbeat(conn, config.gcs_heartbeat, operator_present=lambda: cloud.operator_present)
    builder = StateBuilder(
        conn,
        status,
        clock.now_ms,
        battery_cells=config.battery_cells,
        sysinfo=sysinfo,
        gcs_state=lambda: {"policy": heartbeat.policy, "hb": heartbeat.sending},
    )
    handlers = Handlers(conn, commands, missions, params, status, clock.now_ms, mission_source=cloud)
    executor = Executor(handlers, cloud.enqueue_ack, clock)
    cloud.on_command = executor.submit
    return Companion(config, clock, conn, commands, missions, params, status, streams, sysinfo, builder, cloud, handlers, executor, heartbeat, tlog)


async def run(config: Config) -> None:
    loop = asyncio.get_running_loop()
    c = build(config)

    def on_statustext(msg) -> None:
        target = c.conn.target
        c.status.on_message(msg, target[0] if target else None)

    c.conn.add_listener("STATUSTEXT", on_statustext)
    log.info("connecting to %s", config.mavlink_url)
    c.conn.start(loop)
    await c.cloud.start()

    mqtt = None
    if config.transport == "iot" and config.mqtt.enabled:
        from .links.mqtt import MqttCommandClient

        mqtt = MqttCommandClient(config.mqtt, loop, c.executor.submit)
        mqtt.start()
        log.info("MQTT command channel active")

    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):  # Windows: KeyboardInterrupt ends asyncio.run instead
            pass

    tasks = [
        asyncio.create_task(c.streams.run(), name="streams"),
        asyncio.create_task(c.executor.run(), name="executor"),
        asyncio.create_task(c.cloud.telemetry_loop(c.builder.build, c.status), name="telemetry"),
        asyncio.create_task(c.cloud.ack_loop(), name="acks"),
        asyncio.create_task(c.heartbeat.run(), name="gcs-heartbeat"),
        asyncio.create_task(c.sysinfo.run(), name="sysinfo"),
    ]
    log.info("running (contract v%d, gcs heartbeat %s)", config.contract, config.gcs_heartbeat)
    try:
        await stop.wait()
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if mqtt is not None:
            mqtt.stop()
        await c.cloud.close()
        c.conn.stop()
        log.info("stopped")
