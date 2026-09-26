#!/usr/bin/env bash
# Builds and installs mavlink-router on Raspberry Pi OS (it is not packaged),
# installs our config and enables the service. Run from companion/:
#   bash deploy/install-mavlink-router.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

sudo apt-get update
sudo apt-get install -y git meson ninja-build pkg-config gcc g++

src="$(mktemp -d)/mavlink-router"
git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/mavlink-router/mavlink-router.git "$src"
meson setup "$src/build" "$src" --buildtype=release
ninja -C "$src/build"
sudo ninja -C "$src/build" install

sudo mkdir -p /etc/mavlink-router
if [ ! -f /etc/mavlink-router/main.conf ]; then
  sudo cp "$here/mavlink-router.conf" /etc/mavlink-router/main.conf
else
  echo "/etc/mavlink-router/main.conf exists; left unchanged (compare with $here/mavlink-router.conf)"
fi
sudo systemctl daemon-reload
sudo systemctl enable --now mavlink-router
systemctl --no-pager status mavlink-router | head -5
