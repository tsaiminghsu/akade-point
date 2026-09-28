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
from .links.video import VideoControl
from .mav.command import CommandClient
from .mav.connection import MavConnection
from .mav.heartbeat import GcsHeartbeat
from .mav.mission import MissionClient
from .mav.params import ParamClient
from .mav.statustext import StatusLog
from .mav.streams import StreamManager
from .ops.executor import Executor
from .ops.handlers import Handlers
from .ops.gimbal import GimbalControl, GimbalStreamer
from .ops.manual import ManualDrive
from .mav.logs import DataflashClient
from .ops.adsb import AdsbTracker
from .ops.camera import CameraComponent, RpicamCapture, RtspCapture, TestCapture
from .ops.payload import PayloadControl, PayloadMonitor, RemoteId
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
    video: Optional[VideoControl] = None
    remote_id: Optional[RemoteId] = None
    tlog: Optional[TlogWriter] = None
    camera: Optional[CameraComponent] = None


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
        history_armed_s=config.history_armed_s,
    )
    holder: dict = {}

    def operator_present() -> bool:
        direct = holder.get("direct")
        return cloud.operator_present or bool(direct and direct.operator_present)

    heartbeat = GcsHeartbeat(conn, config.gcs_heartbeat, operator_present=operator_present)
    video = VideoControl(config.video.api_url, config.video.path) if config.video.enabled else None
    payload_monitor = PayloadMonitor(conn)
    conn.add_listener("NAMED_VALUE_FLOAT", payload_monitor.on_named_value)
    adsb = AdsbTracker(conn)
    if config.signing.key is not None:
        conn.enable_signing(config.signing.key)
    dataflash = DataflashClient(conn, config.dataflash_dir) if config.dataflash_dir else None
    camera = None
    if config.camera.enabled:
        cc = config.camera
        source = {"rtsp": lambda: RtspCapture(cc.rtsp_url), "rpicam": lambda: RpicamCapture(cc.width, cc.height), "test": TestCapture}[cc.source]()
        camera = CameraComponent(
            conn, source, cc.photos_dir, model=cc.model, focal_mm=cc.focal_mm,
            sensor_mm=(cc.sensor_w_mm, cc.sensor_h_mm), resolution=(cc.width, cc.height), utc_ms=clock.now_ms,
        )
        conn.add_listener("COMMAND_LONG", camera.on_command)
    conn.add_listener("ADSB_VEHICLE", adsb.on_adsb)
    remote_id = RemoteId(conn, config.remote_id.send_operator_location)
    builder = StateBuilder(
        conn,
        status,
        clock.now_ms,
        battery_cells=config.battery_cells,
        sysinfo=sysinfo,
        gcs_state=lambda: {"policy": heartbeat.policy, "hb": heartbeat.sending},
        video_state=(video.state_block if video else (lambda: None)),
        payload_state=payload_monitor.state_block,
        adsb_state=adsb.state_block,
        logdl_state=(dataflash.state_block if dataflash else (lambda: None)),
        camera_state=camera.state_block if camera else None,
        rid_state=remote_id.state_block,
    )
    handlers = Handlers(
        conn,
        commands,
        missions,
        params,
        status,
        clock.now_ms,
        mission_source=cloud,
        video=video,
        gimbal=GimbalControl(conn, commands),
        payload=PayloadControl(conn, commands),
        dataflash=dataflash,
        camera=camera,
    )

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
            # Inline mission items went to the browser; the log only needs the summary.
            entry["res"] = {k: v for k, v in ack["res"].items() if k not in ("items", "params")}
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
            tlog=tlog,
            gimbal=GimbalStreamer(conn),
            dataflash=dataflash,
            camera=camera,
            lease_holder=cloud.lease_holder,
        )
        holder["direct"] = direct
    return Companion(
        config, clock, conn, commands, missions, params, status, streams, sysinfo, builder, cloud, handlers, executor,
        heartbeat, manual, direct, video, remote_id, tlog, camera,
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
    if c.video is not None:
        await c.video.start()

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
    if c.video is not None:
        tasks.append(asyncio.create_task(c.video.run(), name="video"))
    if c.remote_id is not None:
        tasks.append(asyncio.create_task(c.remote_id.run(), name="remote-id"))
    if c.camera is not None:
        tasks.append(asyncio.create_task(c.camera.run(), name="camera"))
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
        if c.video is not None:
            await c.video.close()
        await c.cloud.close()
        c.conn.stop()
        log.info("stopped")
