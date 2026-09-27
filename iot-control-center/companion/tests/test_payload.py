import asyncio

from vehicle_companion.ops.payload import PayloadControl, PayloadMonitor, RemoteId
from vehicle_companion.state import StateBuilder

from conftest import make_rig


async def test_payload_node_values_and_relays():
    rig = await make_rig("copter", payload=True)
    try:
        monitor = PayloadMonitor(rig.conn)
        rig.conn.add_listener("NAMED_VALUE_FLOAT", monitor.on_named_value)
        rig.handlers.payload = PayloadControl(rig.conn, rig.commands)
        for _ in range(60):
            if monitor.state_block():
                break
            await asyncio.sleep(0.05)
        block = monitor.state_block()
        assert block and block[0]["comp"] == 25 and block[0]["values"]["PAY_VBAT"] == 12.4

        ack = await rig.handlers.run({"id": "p1", "type": "payload_relay", "args": {"index": 2, "on": True}})
        assert ack["st"] == "acked", ack
        assert rig.fake.relays[2] is True
        ack = await rig.handlers.run({"id": "p2", "type": "payload_relay", "args": {"index": 9, "on": True}})
        assert ack["code"] == "MAV_RESULT_DENIED"
        ack = await rig.handlers.run({"id": "p3", "type": "payload_servo", "args": {"index": 1, "pwm": 1900}})
        assert ack["st"] == "acked" and rig.fake.servos[1] == 1900
        ack = await rig.handlers.run({"id": "p4", "type": "payload_pulse", "args": {"index": 0, "ms": 300}})
        assert ack["st"] == "acked"

        s = StateBuilder(rig.conn, rig.status, rig.clock.now_ms, payload_state=monitor.state_block).build()
        assert "payload" in s["caps"] and s["payload"][0]["comp"] == 25
    finally:
        rig.fake.stop()
        rig.conn.stop()


async def test_remote_id_state_absent_without_module(copter):
    rid = RemoteId(copter.conn, send_system=False)
    assert rid.state_block() is None
