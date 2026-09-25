"""CLI entrypoint: python -m vehicle_companion --config /path/to/companion.toml"""

from __future__ import annotations

import argparse

from .config import Config
from .main import run


def cli() -> None:
    parser = argparse.ArgumentParser(prog="vehicle_companion")
    parser.add_argument("--config", required=True, help="path to companion.toml")
    args = parser.parse_args()
    config = Config.load(args.config)
    run(config)


if __name__ == "__main__":
    cli()
