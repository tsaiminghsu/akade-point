"""MAVLink mission protocol upload/download, converting between our JSON item
dicts and MISSION_ITEM_INT messages. Written against the MavlinkLink surface so
it can be exercised with a fake link in tests."""

from __future__ import annotations

import time


def upload(link, items: list[dict], timeout: float = 30.0) -> bool:
    """Uploads a mission using the count → request → item → ack handshake."""
    mav = link.master.mav
    target_sys = link.master.target_system
    target_comp = link.master.target_component

    mav.mission_count_send(target_sys, target_comp, len(items))
    deadline = time.time() + timeout
    sent = set()
    while time.time() < deadline:
        msg = link.master.recv_match(type=["MISSION_REQUEST_INT", "MISSION_REQUEST", "MISSION_ACK"], blocking=True, timeout=2.0)
        if msg is None:
            continue
        mtype = msg.get_type()
        if mtype == "MISSION_ACK":
            # 0 == MAV_MISSION_ACCEPTED
            return getattr(msg, "type", 1) == 0
        seq = msg.seq
        it = items[seq]
        mav.mission_item_int_send(
            target_sys,
            target_comp,
            it["seq"],
            it["frame"],
            it["cmd"],
            it["cur"],
            it["ac"],
            float(it["p1"]),
            float(it["p2"]),
            float(it["p3"]),
            float(it["p4"]),
            int(round(it["lat"] * 1e7)),
            int(round(it["lon"] * 1e7)),
            float(it["alt"]),
        )
        sent.add(seq)
    return False


def download(link, timeout: float = 30.0) -> list[dict]:
    """Downloads the mission currently on the flight controller."""
    mav = link.master.mav
    target_sys = link.master.target_system
    target_comp = link.master.target_component

    mav.mission_request_list_send(target_sys, target_comp)
    count_msg = link.master.recv_match(type="MISSION_COUNT", blocking=True, timeout=timeout)
    if count_msg is None:
        return []
    count = count_msg.count

    items: list[dict] = []
    for seq in range(count):
        mav.mission_request_int_send(target_sys, target_comp, seq)
        item = link.master.recv_match(type=["MISSION_ITEM_INT", "MISSION_ITEM"], blocking=True, timeout=timeout)
        if item is None:
            break
        items.append(_from_item(item))
    mav.mission_ack_send(target_sys, target_comp, 0)  # MAV_MISSION_ACCEPTED
    return items


def _from_item(item) -> dict:
    is_int = item.get_type() == "MISSION_ITEM_INT"
    lat = item.x / 1e7 if is_int else item.x
    lon = item.y / 1e7 if is_int else item.y
    return {
        "seq": item.seq,
        "cur": item.current,
        "frame": item.frame,
        "cmd": item.command,
        "p1": item.param1,
        "p2": item.param2,
        "p3": item.param3,
        "p4": item.param4,
        "lat": round(lat, 7),
        "lon": round(lon, 7),
        "alt": item.z,
        "ac": item.autocontinue,
    }
