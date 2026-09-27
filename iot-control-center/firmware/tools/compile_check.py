"""Compile-checks the ESP32 sketches without arduino-cli.

Compiles (no link) each sketch's .ino as C++ with the Arduino esp32 core's own
toolchain and the "ESP32 Dev Module" flags from its platform.txt, so a
machine that only has the core installed (Arduino15) can still catch type and
API errors. Linking and flashing still need the Arduino IDE or arduino-cli.

    python firmware/tools/compile_check.py [sketch ...]
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

CORE_VERSION = "2.0.17"
ARDUINO15 = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / ".arduino15"))) / "Arduino15"
CORE = ARDUINO15 / "packages" / "esp32" / "hardware" / "esp32" / CORE_VERSION
TOOLS = ARDUINO15 / "packages" / "esp32" / "tools" / "xtensa-esp32-elf-gcc"
ROOT = Path(__file__).resolve().parents[1]
SKETCHES = ["esp32-payload-node", "esp32-rover-base"]
LIBRARIES = ["WiFi"]  # core libraries the sketches include


def read_props(path: Path) -> dict[str, str]:
    props: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        props[k.strip()] = v.strip()
    return props


def expand(value: str, variables: dict[str, str]) -> str:
    for _ in range(10):
        new = re.sub(r"\{([^{}]+)\}", lambda m: variables.get(m.group(1), m.group(0)), value)
        if new == value:
            break
        value = new
    return value


def split_flags(s: str) -> list[str]:
    """Splits on whitespace outside quotes. A token that starts with a quote
    loses its surrounding quotes ("-I/path with space"); quotes inside a
    token are kept (-DMBEDTLS_CONFIG_FILE="mbedtls/esp_config.h" must reach
    the compiler with its quotes)."""
    tokens, cur, quote = [], "", None
    for ch in s:
        if quote:
            cur += ch
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            cur += ch
        elif ch.isspace():
            if cur:
                tokens.append(cur)
                cur = ""
        else:
            cur += ch
    if cur:
        tokens.append(cur)
    out = []
    for t in tokens:
        if len(t) >= 2 and t[0] == t[-1] and t[0] in "\"'":
            t = t[1:-1]
        out.append(t)
    return out


def compiler() -> Path:
    versions = sorted(TOOLS.iterdir()) if TOOLS.exists() else []
    if not versions:
        sys.exit(f"xtensa toolchain not found under {TOOLS}")
    exe = versions[-1] / "bin" / ("xtensa-esp32-elf-g++" + (".exe" if os.name == "nt" else ""))
    if not exe.exists():
        sys.exit(f"missing {exe}")
    return exe


def flags() -> list[str]:
    props = read_props(CORE / "platform.txt")
    variables = {
        "compiler.sdk.path": str(CORE / "tools" / "sdk" / "esp32"),
        "build.mcu": "esp32",
        "build.memory_type": "dio_qspi",
        "build.boot": "dio",
    }
    pre = split_flags(expand(props["compiler.cpreprocessor.flags.esp32"], variables))
    # compiler.cpreprocessor.flags appends the flash-mode include (sdkconfig.h).
    pre.append(f"-I{CORE / 'tools' / 'sdk' / 'esp32' / variables['build.memory_type'] / 'include'}")
    cpp = split_flags(props["compiler.cpp.flags.esp32"])
    cpp = [f for f in cpp if f not in ("-MMD",)]
    defines = [
        "-DF_CPU=240000000L",
        "-DARDUINO=10819",
        "-DARDUINO_ESP32_DEV",
        "-DARDUINO_ARCH_ESP32",
        '-DARDUINO_BOARD="ESP32_DEV"',
        '-DARDUINO_VARIANT="esp32"',
        "-DARDUINO_PARTITION_default",
        "-DESP32",
        "-DCORE_DEBUG_LEVEL=0",
        "-DARDUINO_USB_CDC_ON_BOOT=0",
    ]
    includes = [f"-I{CORE / 'cores' / 'esp32'}", f"-I{CORE / 'variants' / 'esp32'}"]
    includes += [f"-I{CORE / 'libraries' / lib / 'src'}" for lib in LIBRARIES]
    return pre + cpp + defines + ["-Wall", "-Wextra"] + includes


def check(sketch: str, base_flags: list[str], gxx: Path) -> bool:
    d = ROOT / sketch
    ino = d / f"{sketch}.ino"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"{sketch}.ino.cpp"
        src.write_text(f'#include <Arduino.h>\n#line 1 "{ino.as_posix()}"\n' + ino.read_text(encoding="utf-8"), encoding="utf-8")
        # "secrets.h" resolves next to the generated source first, so the check
        # always uses the example and never needs (or reads) real credentials.
        example = d / "secrets.example.h"
        if example.exists():
            (Path(tmp) / "secrets.h").write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
        obj = Path(tmp) / "out.o"
        cmd = [str(gxx), *base_flags, f"-I{d}", "-c", str(src), "-o", str(obj)]
        r = subprocess.run(cmd, capture_output=True, text=True)
    # The generated MAVLink headers trip a few -Wextra warnings of their own;
    # only report diagnostics that point into our sketch files.
    ours = [l for l in (r.stderr or "").splitlines() if sketch in l.replace("\\", "/") and "/src/mavlink/" not in l.replace("\\", "/")]
    status = "ok" if r.returncode == 0 else "FAILED"
    print(f"{sketch}: {status}")
    for line in ours if r.returncode == 0 else (r.stderr or "").splitlines()[-40:]:
        print("   ", line)
    return r.returncode == 0 and not any("warning" in l for l in ours)


def main() -> None:
    if not CORE.exists():
        sys.exit(f"esp32 core {CORE_VERSION} not found at {CORE}")
    gxx = compiler()
    base = flags()
    targets = sys.argv[1:] or SKETCHES
    ok = all([check(s, base, gxx) for s in targets])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
