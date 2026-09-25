# Vehicle Companion (Raspberry Pi)

Bridges a MAVLink flight controller (ArduPilot) to the Akade IoT Control Center,
and fans MAVLink out over UDP so MissionPlanner can connect at the same time.

Full guide: [`../docs/vehicles-companion.md`](../docs/vehicles-companion.md).

## Quick start (SITL, local dev)

```bash
cd companion
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e .

# In the app: Vehicles → add a vehicle (companionId "sitl-copter") → Setup → Generate token
# Or: node ../scripts/seed-vehicle-local.mjs http://localhost:3000   (prints a filled config)
cp companion.example.toml companion.toml          # paste vehicle_id + token

# Start ArduCopter SITL with two MAVLink outputs (companion + MissionPlanner):
#   sim_vehicle.py -v ArduCopter --out udp:127.0.0.1:14550 --out udp:127.0.0.1:14551
python -m vehicle_companion --config companion.toml
```

The vehicle should show **online** in the app within ~2 s. MissionPlanner can
connect to UDP `127.0.0.1:14551` concurrently.

## Tests

```bash
pip install pytest
pytest
```

Unit tests use a fake MAVLink link, so they run without pymavlink or a flight
controller.
