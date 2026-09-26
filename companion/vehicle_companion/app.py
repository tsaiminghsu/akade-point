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
from .links.direct import DirectServer
from .mav.command import CommandClient
from .mav.connection import MavConnection
from .mav.heartbeat import GcsHeartbeat
from .mav.mission import MissionClient
from .mav.params import ParamClient
from .mav.statustext import StatusLog
from .mav.streams import StreamManager
from .ops.executor import Executor
from .ops.handlers import Handlers
from .ops.manual import ManualDrive
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
    manual: ManualDrive
    direct: Optional[DirectServer] = None
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
    holder: dict = {}

    def operator_present() -> bool:
        direct = holder.get("direct")
        return cloud.operator_present or bool(direct and direct.operator_present)

    heartbeat = GcsHeartbeat(conn, config.gcs_heartbeat, operator_present=operator_present)
    builder = StateBuilder(
        conn,
        status,
        clock.now_ms,
        battery_cells=config.battery_cells,
        sysinfo=sysinfo,
        gcs_state=lambda: {"policy": heartbeat.policy, "hb": heartbeat.sending},
    )
    handlers = Handlers(conn, commands, missions, params, status, clock.now_ms, mission_source=cloud)

    def ack_sink(ack: dict) -> None:
        # Direct-link commands ("d_" ids) are unknown to the server; they reach
        # its log through the audit trail below instead of the ack route.
        if not ack["id"].startswith("d_"):
            cloud.enqueue_ack(ack)
        direct = holder.get("direct")
        if direct is not None:
            direct.on_ack(ack)

    executor = Executor(handlers, ack_sink, clock)

    def audit(cmd: dict, ack: dict) -> None:
        if cmd.get("via") != "direct":
            return
        entry = {
            "id": cmd["id"],
            "type": cmd["type"],
            "args": cmd.get("args") or {},
            "st": ack["st"],
            "code": ack["code"],
            "sub": cmd.get("sub", ""),
            "createdAt": cmd.get("iat", ack["t"]),
            "ackedAt": ack["t"],
        }
        if ack.get("msg"):
            entry["msg"] = ack["msg"]
        if ack.get("res"):
            entry["res"] = ack["res"]
        cloud.audit(entry)

    executor.on_finished(audit)
    cloud.on_command = executor.submit
    manual = ManualDrive(conn)
    direct = None
    if config.direct.enabled:
        direct = DirectServer(
            config.direct,
            config.vehicle_id,
            build_state=builder.build,
            executor=executor,
            status=status,
            manual=manual,
            streams=streams,
            clock=clock,
        )
        holder["direct"] = direct
    return Companion(
        config, clock, conn, commands, missions, params, status, streams, sysinfo, builder, cloud, handlers, executor,
        heartbeat, manual, direct, tlog,
    )


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
    if c.direct is not None:
        await c.direct.start()

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
        if c.direct is not None:
            await c.direct.stop()
        await c.cloud.close()
        c.conn.stop()
        log.info("stopped")
