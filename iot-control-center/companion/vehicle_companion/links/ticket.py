"""Verifies direct-link tickets signed by the Control Center.

Mirror of lib/control-center/vehicles/directTicket.ts:
ticket = base64url(JSON payload) + "." + base64url(HMAC-SHA256(key, first part)),
where `key` is the per-vehicle string the companion was configured with
(`[direct] ticket_key`). Both sides are tested against the same vector.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Optional


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def sign(key: str, payload: dict) -> str:
    """Only used by tests and tools; the server signs real tickets."""
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64url(hmac.new(key.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify(key: str, ticket: str, vehicle_id: str, now_ms: float) -> Optional[dict]:
    if not key or not isinstance(ticket, str) or ticket.count(".") != 1:
        return None
    body, sig = ticket.split(".")
    want = hmac.new(key.encode(), body.encode(), hashlib.sha256).digest()
    try:
        got = _b64url_decode(sig)
        payload = json.loads(_b64url_decode(body))
    except (ValueError, json.JSONDecodeError):
        return None
    if not hmac.compare_digest(got, want):
        return None
    if not isinstance(payload, dict) or payload.get("vid") != vehicle_id:
        return None
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or exp < now_ms:
        return None
    if payload.get("scope") not in ("view", "control"):
        return None
    return payload
