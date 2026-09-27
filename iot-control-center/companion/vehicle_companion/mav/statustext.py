"""STATUSTEXT log. Keeps recent messages for the UI and the cloud outbox, and
tracks the vehicle's pre-arm failures: ArduPilot repeats each failing check as
"PreArm: ..." about every 30 s while disarmed, and says "Arm: ..." when an
arm attempt is refused. The UI shows every current failure, not just the first
one Mission Planner's HUD shows."""

from __future__ import annotations

import time
from collections import deque
from typing import Callable, Optional

PREARM_PREFIXES = ("PreArm:", "Arm:")
# A pre-arm message counts as current for slightly longer than ArduPilot's
# 30 s repeat so a check does not flicker off between repeats.
PREARM_WINDOW_S = 35.0

SEVERITY_NAMES = {
    0: "EMERGENCY",
    1: "ALERT",
    2: "CRITICAL",
    3: "ERROR",
    4: "WARNING",
    5: "NOTICE",
    6: "INFO",
    7: "DEBUG",
}


def _text(msg) -> str:
    t = msg.text
    if isinstance(t, bytes):
        t = t.decode("utf-8", "replace")
    return t.rstrip("\x00").strip()


class StatusLog:
    def __init__(self, now_ms: Callable[[], int], maxlen: int = 200, outbox_max: int = 100):
        self._now_ms = now_ms
        self.entries: deque[dict] = deque(maxlen=maxlen)
        self._outbox: deque[dict] = deque(maxlen=outbox_max)
        self._seq = 0
        self._prearm: dict[str, float] = {}
        self._chunks: dict[tuple[int, int], list[str]] = {}
        self._on_entry: list[Callable[[dict], None]] = []

    def on_entry(self, fn: Callable[[dict], None]) -> None:
        self._on_entry.append(fn)

    def on_message(self, msg, target_sysid: Optional[int] = None) -> None:
        if target_sysid is not None and msg.get_srcSystem() != target_sysid:
            return
        text = _text(msg)
        # MAVLink2 chunking: id != 0 groups chunks; a chunk shorter than 50
        # characters ends the group.
        chunk_id = getattr(msg, "id", 0)
        if chunk_id:
            key = (msg.get_srcComponent(), chunk_id)
            parts = self._chunks.setdefault(key, [])
            parts.append(text)
            if len(text) >= 50:
                return
            text = "".join(parts)
            del self._chunks[key]
        if not text:
            return
        self._seq += 1
        entry = {"seq": self._seq, "t": self._now_ms(), "sev": int(msg.severity), "text": text, "comp": msg.get_srcComponent()}
        self.entries.append(entry)
        self._outbox.append(entry)
        if text.startswith(PREARM_PREFIXES):
            self._prearm[text] = time.monotonic()
        for fn in self._on_entry:
            fn(entry)

    def clear_prearm(self) -> None:
        """Forget pre-arm failures, e.g. once the vehicle arms."""
        self._prearm.clear()

    def prearm_failures(self) -> list[str]:
        now = time.monotonic()
        live = [(t, text) for text, t in self._prearm.items() if now - t <= PREARM_WINDOW_S]
        return [text for _, text in sorted(live)]

    def recent(self, n: int = 50) -> list[dict]:
        return list(self.entries)[-n:]

    def since(self, seq: int) -> list[dict]:
        return [e for e in self.entries if e["seq"] > seq]

    def take_outbox(self) -> list[dict]:
        out = list(self._outbox)
        self._outbox.clear()
        return out

    def requeue(self, entries: list[dict]) -> None:
        """Put back entries a failed POST did not deliver, oldest first."""
        for e in reversed(entries):
            self._outbox.appendleft(e)
