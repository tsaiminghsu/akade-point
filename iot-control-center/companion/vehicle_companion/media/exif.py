"""Geotags a JPEG: builds an EXIF APP1 segment (camera, time, GPS position,
altitude and heading) and puts it right after the SOI marker, replacing any
EXIF the capture already had. No imaging library needed on the Pi.

TIFF layout (little-endian): IFD0 -> Exif IFD (DateTimeOriginal) and GPS IFD.
Values longer than four bytes live in a data area after each IFD.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

BYTE, ASCII, SHORT, LONG, RATIONAL, UNDEFINED = 1, 2, 3, 4, 5, 7


@dataclass
class Geotag:
    lat: float
    lon: float
    #: metres above mean sea level
    alt: Optional[float]
    when: datetime
    #: compass heading of the camera, degrees (the vehicle's, for a fixed camera)
    heading: Optional[float] = None


def _ascii(s: str) -> bytes:
    return s.encode("ascii", "replace") + b"\x00"


def _rational(value: float, denominator: int = 10_000) -> tuple[int, int]:
    return (int(round(abs(value) * denominator)), denominator)


def _dms(deg: float) -> list[tuple[int, int]]:
    deg = abs(deg)
    d = int(deg)
    m_float = (deg - d) * 60
    m = int(m_float)
    s = (m_float - m) * 60
    return [(d, 1), (m, 1), _rational(s, 10_000)]


class _Ifd:
    def __init__(self) -> None:
        self.entries: list[tuple[int, int, int, bytes]] = []

    def add(self, tag: int, typ: int, value) -> None:
        if typ == ASCII:
            data = value if isinstance(value, bytes) else _ascii(value)
            count = len(data)
        elif typ in (BYTE, UNDEFINED):
            data = bytes(value)
            count = len(data)
        elif typ == SHORT:
            vals = value if isinstance(value, (list, tuple)) else [value]
            data = b"".join(struct.pack("<H", v) for v in vals)
            count = len(vals)
        elif typ == LONG:
            vals = value if isinstance(value, (list, tuple)) else [value]
            data = b"".join(struct.pack("<I", v) for v in vals)
            count = len(vals)
        elif typ == RATIONAL:
            vals = value if isinstance(value, list) else [value]
            data = b"".join(struct.pack("<II", n, d) for n, d in vals)
            count = len(vals)
        else:
            raise ValueError(typ)
        self.entries.append((tag, typ, count, data))

    def size(self) -> int:
        """Bytes this IFD takes, entries plus its data area."""
        extra = sum(len(d) + (len(d) & 1) for (_t, _ty, _c, d) in self.entries if len(d) > 4)
        return 2 + 12 * len(self.entries) + 4 + extra

    def pack(self, offset: int) -> bytes:
        """The IFD placed at `offset` from the start of the TIFF header."""
        entries = sorted(self.entries, key=lambda e: e[0])
        data_at = offset + 2 + 12 * len(entries) + 4
        head = struct.pack("<H", len(entries))
        data = b""
        for tag, typ, count, value in entries:
            if len(value) <= 4:
                head += struct.pack("<HHI", tag, typ, count) + value.ljust(4, b"\x00")
            else:
                head += struct.pack("<HHII", tag, typ, count, data_at + len(data))
                data += value + (b"\x00" if len(value) & 1 else b"")
        return head + struct.pack("<I", 0) + data


def build_app1(tag: Geotag, *, make: str, model: str, description: str = "") -> bytes:
    when = tag.when.astimezone(timezone.utc)
    stamp = when.strftime("%Y:%m:%d %H:%M:%S")

    gps = _Ifd()
    gps.add(0x0000, BYTE, [2, 3, 0, 0])
    gps.add(0x0001, ASCII, "N" if tag.lat >= 0 else "S")
    gps.add(0x0002, RATIONAL, _dms(tag.lat))
    gps.add(0x0003, ASCII, "E" if tag.lon >= 0 else "W")
    gps.add(0x0004, RATIONAL, _dms(tag.lon))
    if tag.alt is not None:
        gps.add(0x0005, BYTE, [0 if tag.alt >= 0 else 1])
        gps.add(0x0006, RATIONAL, [_rational(tag.alt, 100)])
    gps.add(0x0007, RATIONAL, [(when.hour, 1), (when.minute, 1), _rational(when.second + when.microsecond / 1e6, 1000)])
    if tag.heading is not None:
        gps.add(0x0010, ASCII, "T")
        gps.add(0x0011, RATIONAL, [_rational(tag.heading % 360.0, 100)])
    gps.add(0x001D, ASCII, when.strftime("%Y:%m:%d"))

    exif = _Ifd()
    exif.add(0x9000, UNDEFINED, b"0232")  # ExifVersion
    exif.add(0x9003, ASCII, stamp)

    ifd0 = _Ifd()
    if description:
        ifd0.add(0x010E, ASCII, description)
    ifd0.add(0x010F, ASCII, make)
    ifd0.add(0x0110, ASCII, model)
    ifd0.add(0x0132, ASCII, stamp)
    ifd0.add(0x8769, LONG, 0)  # Exif IFD offset, patched below
    ifd0.add(0x8825, LONG, 0)  # GPS IFD offset, patched below

    ifd0_at = 8
    exif_at = ifd0_at + ifd0.size()
    gps_at = exif_at + exif.size()
    ifd0.entries = [(t, ty, c, struct.pack("<I", exif_at if t == 0x8769 else gps_at) if t in (0x8769, 0x8825) else d) for (t, ty, c, d) in ifd0.entries]

    tiff = b"II*\x00" + struct.pack("<I", ifd0_at) + ifd0.pack(ifd0_at) + exif.pack(exif_at) + gps.pack(gps_at)
    body = b"Exif\x00\x00" + tiff
    if len(body) + 2 > 0xFFFF:
        raise ValueError("EXIF too large")
    return b"\xff\xe1" + struct.pack(">H", len(body) + 2) + body


def insert_app1(jpeg: bytes, app1: bytes) -> bytes:
    """The JPEG with `app1` right after SOI and any existing EXIF APP1 removed."""
    if jpeg[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    out = bytearray(jpeg[:2]) + app1
    i = 2
    # Copy the header segments, dropping Exif APP1s, until the scan starts.
    while i + 4 <= len(jpeg) and jpeg[i] == 0xFF:
        marker = jpeg[i + 1]
        if marker in (0xDA, 0xD9):  # start of scan / end of image: copy the rest
            break
        length = struct.unpack(">H", jpeg[i + 2 : i + 4])[0]
        segment = jpeg[i : i + 2 + length]
        if not (marker == 0xE1 and segment[4:10] == b"Exif\x00\x00"):
            out += segment
        i += 2 + length
    out += jpeg[i:]
    return bytes(out)


def geotag_jpeg(jpeg: bytes, tag: Geotag, *, make: str = "Raspberry Pi", model: str = "Camera", description: str = "") -> bytes:
    return insert_app1(jpeg, build_app1(tag, make=make, model=model, description=description))
