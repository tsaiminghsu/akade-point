# Vehicle Companion (Raspberry Pi)

Bridges a MAVLink flight controller (ArduPilot first, PX4 basics) to the Akade
IoT Control Center. On the Pi, mavlink-router owns the flight controller's
serial port so Mission Planner or QGroundControl can connect at the same time;
the companion is one of its endpoints.

Full guide: [`../docs/vehicles-companion.md`](../docs/vehicles-companion.md).

## Layout

| Path | What |
|---|---|
| `vehicle_companion/mav/` | MAVLink: one reader thread + subscriptions (`connection.py`), command, mission (mission/fence/rally), parameter and stream-rate protocols, STATUSTEXT log, GCS heartbeat policy |
| `vehicle_companion/ops/` | Command handlers and the three-lane executor (priority / fast / slow, dedupe, expiry) |
| `vehicle_companion/links/` | Control Center HTTPS link (telemetry, ack outbox, missions) and MQTT push |
| `vehicle_companion/state.py` | Vehicle state (contract v2; unknown = null, never 0) and the v1 projection |
| `vehicle_companion/tools/fake_autopilot.py` | ArduPilot-like autopilot over UDP for tests and UI work without SITL |
| `deploy/` | systemd template unit, mavlink-router config and installer |

## Quick start (local dev, no hardware)

```bash
cd companion
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Control Center running on :3100 with DynamoDB Local, then:
node ../scripts/seed-vehicle-local.mjs http://localhost:3100   # prints a filled config
# save it as companion.local.toml, then in two terminals:
python -m vehicle_companion.tools.fake_autopilot --vehicle copter --to 127.0.0.1:14550
python -m vehicle_companion --config companion.local.toml
```

The vehicle shows **online** within ~2 s. With ArduPilot SITL instead of the
fake autopilot: `sim_vehicle.py -v ArduCopter --out udp:127.0.0.1:14550`.

## Tests

```bash
pytest
```

Integration tests run the companion against the fake autopilot over UDP
loopback. The fake shares our assumptions about ArduPilot, so behaviour that
matters in the air still needs a SITL run (see `docs/vehicles-local-dev-and-verification.md`).
