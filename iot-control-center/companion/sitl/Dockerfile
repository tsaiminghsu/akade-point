# ArduPilot SITL + mavlink-router in one Linux container, laid out like the Pi:
# mavlink-router owns the "autopilot" link (SITL's serial0 over TCP instead of
# a UART) and fans MAVLink out to the companion and to Mission Planner / QGC.
#
#   docker build -t akade-sitl companion/sitl
#   docker run --rm -it -p 5760:5760 -p 14550:14550/udp -e VEHICLE=copter akade-sitl
#
# See docs/vehicles-local-dev-and-verification.md ("ArduPilot SITL").
FROM ubuntu:24.04

ARG AP_VERSION=stable-4.7.1
# ArduPilot commit of that release, for the default parameter files.
ARG AP_COMMIT=dbe792162d06cab66c3475fd5556bf7a120f119e

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git meson ninja-build pkg-config gcc g++ \
 && rm -rf /var/lib/apt/lists/*

# Same build as deploy/install-mavlink-router.sh.
RUN git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/mavlink-router/mavlink-router.git /tmp/mr \
 && meson setup /tmp/mr/build /tmp/mr --buildtype=release -Dsystemdsystemunitdir=/usr/lib/systemd/system \
 && ninja -C /tmp/mr/build \
 && ninja -C /tmp/mr/build install \
 && rm -rf /tmp/mr

RUN mkdir -p /sitl && cd /sitl \
 && curl -fsSLO https://firmware.ardupilot.org/Copter/${AP_VERSION}/SITL_x86_64_linux_gnu/arducopter \
 && curl -fsSLO https://firmware.ardupilot.org/Rover/${AP_VERSION}/SITL_x86_64_linux_gnu/ardurover \
 && chmod +x arducopter ardurover \
 && for f in copter.parm rover.parm; do \
      curl -fsSLO https://raw.githubusercontent.com/ArduPilot/ardupilot/${AP_COMMIT}/Tools/autotest/default_params/$f; \
    done

COPY main.conf.in /etc/mavlink-router/main.conf.in
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh /etc/mavlink-router/main.conf.in && chmod +x /entrypoint.sh

# 5760/tcp: Mission Planner "TCP"; 14550/udp: MP/QGC "UDP".
EXPOSE 5760/tcp 14550/udp
ENTRYPOINT ["/entrypoint.sh"]
