"""CLI entrypoint: python -m vehicle_companion --config /path/to/companion.toml"""

from __future__ import annotations

import os

# Must precede any pymavlink import (see mav/proto.py).
os.environ.setdefault("MAVLINK20", "1")

import argparse  # noqa: E402
import asyncio  # noqa: E402
import logging  # noqa: E402


def cli() -> None:
    parser = argparse.ArgumentParser(prog="vehicle_companion")
    parser.add_argument("--config", required=True, help="path to companion.toml")
    args = parser.parse_args()

    from .app import run
    from .config import Config

    config = Config.load(args.config)
    logging.basicConfig(level=config.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        asyncio.run(run(config))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    cli()
