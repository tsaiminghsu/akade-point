import asyncio
import hashlib

from vehicle_companion.config import SigningConfig

from conftest import make_rig

KEY = hashlib.sha256(b"a long enough passphrase").digest()


def test_key_is_sha256_of_the_passphrase_like_mission_planner():
    assert SigningConfig("a long enough passphrase").key == KEY
    assert SigningConfig("").key is None


async def test_signed_companion_commands_a_vehicle_that_requires_signing():
    rig = await make_rig("copter", signing_key=KEY)
    try:
        rig.conn.enable_signing(KEY)
        ack = await rig.handlers.run({"id": "s1", "type": "set_mode", "args": {"mode": "GUIDED"}})
        assert ack["st"] == "acked" and rig.fake.mode == "GUIDED"
    finally:
        rig.fake.stop()
        rig.conn.stop()


async def test_unsigned_companion_is_ignored_by_a_signing_vehicle():
    rig = await make_rig("copter", signing_key=KEY)
    try:
        ack = await rig.handlers.run({"id": "u1", "type": "set_mode", "args": {"mode": "GUIDED"}})
        assert ack["st"] == "failed" and rig.fake.mode != "GUIDED"
    finally:
        rig.fake.stop()
        rig.conn.stop()


async def test_signing_apply_sends_the_key_and_zero_to_disable():
    rig = await make_rig("copter")
    try:
        no_key = await rig.handlers.run({"id": "k0", "type": "signing_apply", "args": {"enable": True}})
        assert no_key["code"] == "NO_KEY"
        rig.conn.enable_signing(KEY)
        ack = await rig.handlers.run({"id": "k1", "type": "signing_apply", "args": {"enable": True}})
        assert ack["st"] == "acked"
        for _ in range(40):
            if rig.fake.setup_signing_key:
                break
            await asyncio.sleep(0.05)
        assert rig.fake.setup_signing_key == KEY
        await rig.handlers.run({"id": "k2", "type": "signing_apply", "args": {"enable": False}})
        for _ in range(40):
            if rig.fake.setup_signing_key == bytes(32):
                break
            await asyncio.sleep(0.05)
        assert rig.fake.setup_signing_key == bytes(32)
    finally:
        rig.fake.stop()
        rig.conn.stop()
