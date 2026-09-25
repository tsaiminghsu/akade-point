"""Bidirectional UDP fan-out so MissionPlanner (or QGroundControl) can share the
MAVLink stream with the companion. Outbound: every message the FC sends is
copied to each configured UDP target. Inbound: bytes from those peers are
written back to the FC, so the GCS can command the vehicle too."""

from __future__ import annotations

import socket
import threading


class UdpForwarder:
    def __init__(self, link, targets: list[str]):
        self.link = link
        self.targets: list[tuple[str, int]] = []
        for t in targets:
            host, _, port = t.partition(":")
            if host and port:
                self.targets.append((host, int(port)))
        self._sock: socket.socket | None = None
        self._running = False
        self._reader: threading.Thread | None = None

    def start(self) -> None:
        if not self.targets:
            return
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.setblocking(False)
        # Outbound: hook the link's raw callback.
        self.link.on_raw = self._on_raw
        self._running = True
        self._reader = threading.Thread(target=self._inbound_loop, daemon=True)
        self._reader.start()

    def _on_raw(self, data: bytes) -> None:
        if self._sock is None:
            return
        for target in self.targets:
            try:
                self._sock.sendto(data, target)
            except OSError:
                pass

    def _inbound_loop(self) -> None:
        # Bind a receive socket per target port so a GCS reply reaches the FC.
        recv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        recv.setblocking(False)
        try:
            recv.bind(("0.0.0.0", 0))
        except OSError:
            return
        recv.settimeout(0.2)
        while self._running:
            try:
                data, _ = recv.recvfrom(4096)
                self.link.write_raw(data)
            except (socket.timeout, BlockingIOError, OSError):
                continue

    def stop(self) -> None:
        self._running = False
        if self._sock is not None:
            self._sock.close()
