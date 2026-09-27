"""Generates the MAVLink C headers the ESP32 sketches use.

Instead of vendoring the whole c_library_v2 (~3 MB), this builds a dialect
containing only the messages the firmware sends or reads, copied verbatim
from pymavlink's common.xml, and runs pymavlink's own mavgen on it. The
wire format (message ids, CRC extras) is identical to common.xml's.

    companion/.venv/Scripts/python firmware/tools/gen_mavlink.py
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

os.environ.setdefault("MAVLINK20", "1")

import pymavlink  # noqa: E402
from pymavlink.generator import mavgen  # noqa: E402

MESSAGES = [
    "HEARTBEAT",
    "SYS_STATUS",
    "SET_MODE",
    "GPS_RAW_INT",
    "ATTITUDE",
    "GLOBAL_POSITION_INT",
    "VFR_HUD",
    "COMMAND_LONG",
    "COMMAND_ACK",
    "SET_POSITION_TARGET_LOCAL_NED",
    "NAMED_VALUE_FLOAT",
    "STATUSTEXT",
]

ROOT = Path(__file__).resolve().parents[1]
SKETCHES = ["esp32-payload-node", "esp32-rover-base"]


def build_xml(dest: Path) -> None:
    # common.xml includes standard.xml and minimal.xml (HEARTBEAT lives there).
    base = Path(pymavlink.__file__).parent / "message_definitions" / "v1.0"
    by_name = {}
    for name in ("minimal.xml", "standard.xml", "common.xml"):
        for m in ET.parse(base / name).getroot().iter("message"):
            by_name.setdefault(m.get("name"), m)
    missing = [n for n in MESSAGES if n not in by_name]
    if missing:
        sys.exit(f"not in common/standard/minimal.xml: {missing}")
    root = ET.Element("mavlink")
    ET.SubElement(root, "version").text = "3"
    ET.SubElement(root, "dialect").text = "0"
    msgs = ET.SubElement(root, "messages")
    for name in MESSAGES:
        m = by_name[name]
        for f in m.iter("field"):
            # Keep the definitions self-contained: enums are plain integers here.
            for attr in ("enum", "display"):
                f.attrib.pop(attr, None)
        msgs.append(m)
    ET.ElementTree(root).write(dest, encoding="utf-8", xml_declaration=True)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        xml = Path(tmp) / "akade_min.xml"
        build_xml(xml)
        out = Path(tmp) / "out"
        opts = mavgen.Opts(str(out), wire_protocol="2.0", language="C", validate=False)
        if not mavgen.mavgen(opts, [str(xml)]):
            sys.exit("mavgen failed")
        for sketch in SKETCHES:
            dest = ROOT / sketch / "src" / "mavlink"
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(out, dest)
            print(f"wrote {dest.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
