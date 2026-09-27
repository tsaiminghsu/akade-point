"""Server-aligned wall clock.

A Raspberry Pi has no real-time clock; until NTP syncs (or forever, on a 4G
link that blocks NTP) its wall time can be far off. Every telemetry response
carries the server's `now`, and we keep an offset from it so timestamps we
send and command expiry checks use the server's timeline. Until the first
sync, `synced` is False and expiry is not enforced — rejecting every command
because the Pi booted in 1970 would be worse than the risk it guards against.
"""

from __future__ import annotations

import time


class Clock:
    def __init__(self, smoothing: float = 0.2):
        self.offset_ms = 0.0
        self.synced = False
        self.rtt_ms: float | None = None
        self._smoothing = smoothing

    def now_ms(self) -> int:
        return int(time.time() * 1000 + self.offset_ms)

    def update(self, server_ms: float, sent_local_ms: float, recv_local_ms: float) -> None:
        """Feeds one request/response round trip. Assumes the server stamped
        `now` halfway through the round trip."""
        rtt = max(0.0, recv_local_ms - sent_local_ms)
        sample = server_ms + rtt / 2 - recv_local_ms
        if not self.synced or abs(sample - self.offset_ms) > 5000:
            self.offset_ms = sample  # first sample, or the local clock jumped
        else:
            self.offset_ms += self._smoothing * (sample - self.offset_ms)
        self.rtt_ms = rtt
        self.synced = True

    @staticmethod
    def local_ms() -> float:
        return time.time() * 1000
