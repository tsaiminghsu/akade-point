import array
import asyncio
import sys
import zipfile

from vehicle_companion.terrain.server import TerrainServer, block_heights, offset
from vehicle_companion.terrain.srtm import SrtmStore, tile_name

from conftest import make_rig

N = 1201  # SRTM3


def synthetic_tile(path, name="N24E120"):
    """Height rises 2 m per post northwards and 1 m per post eastwards."""
    h = array.array("h", [(N - 1 - r) * 2 + c for r in range(N) for c in range(N)])
    if sys.byteorder == "little":
        h.byteswap()
    with zipfile.ZipFile(path / f"{name}.hgt.zip", "w") as z:
        z.writestr(f"{name}.hgt", h.tobytes())


def test_tile_names_and_bilinear_heights(tmp_path):
    assert tile_name(24.1477, 120.6736) == "N24E120"
    assert tile_name(-0.5, -0.5) == "S01W001"
    synthetic_tile(tmp_path)
    st = SrtmStore(tmp_path)
    post = 1 / (N - 1)
    assert st.height(24.0, 120.0) == 0  # south-west corner
    assert abs(st.height(24.0 + post, 120.0) - 2) < 1e-6  # one post north
    assert abs(st.height(24.0, 120.0 + post) - 1) < 1e-6  # one post east
    assert abs(st.height(24.0 + post / 2, 120.0 + post / 2) - 1.5) < 1e-9
    assert st.height(25.5, 120.5) is None  # no tile


def test_blocks_run_north_then_east(tmp_path):
    synthetic_tile(tmp_path)
    st = SrtmStore(tmp_path)
    spacing = 92  # about one SRTM3 post
    lat, lon = 24.2, 120.3
    b0 = block_heights(st, lat, lon, spacing, 0)
    # data[i*4+j]: i northwards (+2 m per post), j eastwards (+1 m per post).
    assert b0[4] - b0[0] in (1, 2, 3) and b0[1] - b0[0] in (0, 1, 2)
    assert b0[4] - b0[0] > b0[1] - b0[0]
    # Bit 8 is the next block row, four posts further north; bit 1 four posts east.
    assert block_heights(st, lat, lon, spacing, 8)[0] - b0[0] > block_heights(st, lat, lon, spacing, 1)[0] - b0[0]


def test_offset_matches_ardupilot_flat_earth():
    lat, lon = offset(24.0, 120.0, 1000, 0)
    assert abs((lat - 24.0) * 111_319.5 - 1000) < 5 and lon == 120.0


async def test_answers_terrain_requests_and_reports_missing_tiles(tmp_path):
    synthetic_tile(tmp_path)
    rig = await make_rig("copter")
    try:
        server = TerrainServer(rig.conn, tmp_path)
        rig.conn.add_listener("TERRAIN_REQUEST", server.on_request)
        got = []
        rig.fake.on_terrain_data = got.append
        rig.fake.mav.terrain_request_send(int(24.2e7), int(120.3e7), 100, (1 << 0) | (1 << 9) | (1 << 55))
        for _ in range(60):
            if len(got) == 3:
                break
            await asyncio.sleep(0.05)
        assert sorted(m.gridbit for m in got) == [0, 9, 55]
        assert all(len(m.data) == 16 and m.grid_spacing == 100 for m in got)
        # A request over the sea / an absent tile is noted, not answered.
        rig.fake.mav.terrain_request_send(int(30.2e7), int(121.3e7), 100, 1)
        await asyncio.sleep(0.3)
        assert server.state_block()["missing"] == ["N30E121"]
    finally:
        rig.fake.stop()
        rig.conn.stop()
