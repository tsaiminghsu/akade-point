#!/bin/sh
# Starts ArduPilot SITL and mavlink-router. Environment:
#   VEHICLE    copter (default) | rover
#   SITL_HOME  lat,lon,alt,heading (default: Taichung)
#   COMPANION_HOST  where the companion listens (default: host.docker.internal)
#   SPEEDUP    simulation speed-up (default 1)
set -e

VEHICLE="${VEHICLE:-copter}"
SITL_HOME="${SITL_HOME:-24.1477,120.6736,80,0}"
SPEEDUP="${SPEEDUP:-1}"
host="${COMPANION_HOST:-host.docker.internal}"
ip="$(getent ahostsv4 "$host" | awk 'NR==1 {print $1}')"
if [ -z "$ip" ]; then
  echo "cannot resolve $host; set COMPANION_HOST to the companion's IP" >&2
  exit 1
fi
sed "s/@COMPANION_HOST@/$ip/" /etc/mavlink-router/main.conf.in > /etc/mavlink-router/main.conf

case "$VEHICLE" in
  copter) bin=arducopter; model="+"; parm=copter.parm ;;
  rover) bin=ardurover; model=rover; parm=rover.parm ;;
  *) echo "VEHICLE must be copter or rover" >&2; exit 1 ;;
esac

mkdir -p /sitl/work && cd /sitl/work
echo "SITL $VEHICLE at $SITL_HOME; companion endpoint $ip:14540"
# -I1 puts serial0 on TCP 5770, leaving 5760 to mavlink-router's TCP server.
"/sitl/$bin" --model "$model" --home "$SITL_HOME" --defaults "/sitl/$parm" --speedup "$SPEEDUP" -I1 &
sim=$!
trap 'kill $sim 2>/dev/null' EXIT INT TERM
sleep 1
mavlink-routerd -c /etc/mavlink-router/main.conf
