"""Executes a command envelope against the flight controller and always
produces an ack dict. Preconditions and per-type MAV_CMD mapping live here; the
executor dedupes by command id and enforces the server-supplied timeout."""

from __future__ import annotations

import time

from . import mission

# MAV_CMD ids
MAV_CMD_COMPONENT_ARM_DISARM = 400
MAV_CMD_NAV_TAKEOFF = 22
MAV_CMD_DO_REPOSITION = 192
MAV_CMD_MISSION_START = 300
MAV_RESULT_ACCEPTED = 0


def _ack(cmd_id: str, ok: bool, code: str, msg: str = "", res: dict | None = None) -> dict:
    out = {"v": 1, "id": cmd_id, "st": "acked" if ok else "failed", "code": code, "t": int(time.time() * 1000)}
    if msg:
        out["msg"] = msg
    if res:
        out["res"] = res
    return out


class CommandExecutor:
    def __init__(self, link, api, config):
        self.link = link
        self.api = api
        self.config = config
        self._done: set[str] = set()

    def execute(self, cmd: dict) -> dict:
        """Runs one command and returns the ack dict (also already POSTed)."""
        cmd_id = cmd.get("id", "")
        if cmd_id in self._done:
            return _ack(cmd_id, True, "DUPLICATE_IGNORED")
        self._done.add(cmd_id)
        if len(self._done) > 256:
            self._done = set(list(self._done)[-128:])

        ack = self._dispatch(cmd)
        try:
            self.api.post_ack(cmd_id, ack)
        except Exception as exc:
            print(f"[commands] ack POST failed: {exc}")
        return ack

    def _dispatch(self, cmd: dict) -> dict:
        cmd_id = cmd.get("id", "")
        ctype = cmd.get("type")
        args = cmd.get("args", {}) or {}
        try:
            if ctype == "arm":
                return self._arm(cmd_id, True)
            if ctype == "disarm":
                return self._arm(cmd_id, False, force=bool(args.get("force")))
            if ctype == "set_mode":
                return self._set_mode(cmd_id, args.get("mode", ""))
            if ctype == "takeoff":
                return self._takeoff(cmd_id, float(args.get("alt", 0)))
            if ctype == "goto":
                return self._goto(cmd_id, float(args["lat"]), float(args["lon"]), float(args["alt"]))
            if ctype == "rtl":
                return self._set_mode(cmd_id, "RTL")
            if ctype == "mission_start":
                return self._mission_start(cmd_id)
            if ctype == "mission_upload":
                return self._mission_upload(cmd_id, args.get("missionId", ""))
            if ctype == "mission_download":
                return self._mission_download(cmd_id)
            return _ack(cmd_id, False, "UNKNOWN_COMMAND", f"unknown type {ctype}")
        except Exception as exc:
            return _ack(cmd_id, False, "EXECUTOR_ERROR", str(exc))

    def _arm(self, cmd_id: str, arm: bool, force: bool = False) -> dict:
        param2 = 21196 if force else 0
        result = self.link.command_long(MAV_CMD_COMPONENT_ARM_DISARM, 1 if arm else 0, param2, timeout=10)
        return _ack(cmd_id, result == MAV_RESULT_ACCEPTED, _result_code(result))

    def _set_mode(self, cmd_id: str, mode: str) -> dict:
        if not mode:
            return _ack(cmd_id, False, "BAD_MODE", "no mode")
        ok = self.link.set_mode(mode)
        return _ack(cmd_id, ok, "MAV_RESULT_ACCEPTED" if ok else "MODE_REJECTED", "" if ok else f"could not enter {mode}")

    def _takeoff(self, cmd_id: str, alt: float) -> dict:
        # A copter must be in GUIDED and armed before NAV_TAKEOFF is accepted.
        if not self.link.set_mode("GUIDED"):
            return _ack(cmd_id, False, "MODE_REJECTED", "could not enter GUIDED")
        arm = self.link.command_long(MAV_CMD_COMPONENT_ARM_DISARM, 1, 0, timeout=10)
        if arm != MAV_RESULT_ACCEPTED:
            return _ack(cmd_id, False, "NOT_ARMED", "arming failed")
        result = self.link.command_long(MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, alt, timeout=30)
        return _ack(cmd_id, result == MAV_RESULT_ACCEPTED, _result_code(result), res={"alt": alt})

    def _goto(self, cmd_id: str, lat: float, lon: float, alt: float) -> dict:
        # DO_REPOSITION works for both copter (GUIDED) and rover; ensure GUIDED.
        self.link.set_mode("GUIDED")
        result = self.link.command_long(
            MAV_CMD_DO_REPOSITION, -1, 0, 0, float("nan"), lat, lon, alt, timeout=10
        )
        return _ack(cmd_id, result == MAV_RESULT_ACCEPTED, _result_code(result))

    def _mission_start(self, cmd_id: str) -> dict:
        if not self.link.set_mode("AUTO"):
            return _ack(cmd_id, False, "MODE_REJECTED", "could not enter AUTO")
        result = self.link.command_long(MAV_CMD_MISSION_START, 0, 0, timeout=10)
        return _ack(cmd_id, result == MAV_RESULT_ACCEPTED, _result_code(result))

    def _mission_upload(self, cmd_id: str, mission_id: str) -> dict:
        data = self.api.get_mission(mission_id)
        if not data:
            return _ack(cmd_id, False, "MISSION_FETCH_FAILED", "could not fetch mission")
        ok = mission.upload(self.link, data.get("items", []))
        return _ack(cmd_id, ok, "MAV_RESULT_ACCEPTED" if ok else "MISSION_UPLOAD_FAILED", res={"n": len(data.get("items", []))})

    def _mission_download(self, cmd_id: str) -> dict:
        items = mission.download(self.link)
        if not items:
            return _ack(cmd_id, False, "MISSION_DOWNLOAD_EMPTY", "no items")
        ok = self.api.post_mission_download(cmd_id, items)
        return _ack(cmd_id, bool(ok), "MAV_RESULT_ACCEPTED" if ok else "DOWNLOAD_POST_FAILED", res={"n": len(items)})


def _result_code(result) -> str:
    names = {0: "MAV_RESULT_ACCEPTED", 1: "MAV_RESULT_TEMPORARILY_REJECTED", 2: "MAV_RESULT_DENIED", 3: "MAV_RESULT_UNSUPPORTED", 4: "MAV_RESULT_FAILED"}
    if result is None:
        return "TIMEOUT"
    return names.get(result, f"MAV_RESULT_{result}")
