/**
 * End-to-end smoke test against a running dev server with SITL + companion.
 * Waits for the seeded vehicle to be online, then drives a short flight and
 * polls each command to a terminal state. Exits non-zero on failed/timeout.
 *
 *   node scripts/vehicles-smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const COMPANION_ID = "sitl-copter";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function findVehicle() {
  const { vehicles } = await api("/api/control-center/vehicles");
  const v = vehicles.find((x) => x.companionId === COMPANION_ID);
  if (!v) throw new Error(`No vehicle with companionId ${COMPANION_ID} — run seed-vehicle-local.mjs first`);
  return v;
}

async function waitOnline(id, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { vehicle } = await api(`/api/control-center/vehicles/${id}`);
    if (vehicle.linkState === "online") return vehicle;
    await sleep(1000);
  }
  throw new Error("vehicle never came online — is the companion running?");
}

async function sendAndWait(id, request, label, timeoutMs = 40_000) {
  const { command } = await api(`/api/control-center/vehicles/${id}/commands`, { method: "POST", body: JSON.stringify(request) });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { commands } = await api(`/api/control-center/vehicles/${id}/commands?limit=100`);
    const c = commands.find((x) => x.id === command.id);
    if (c && ["acked", "failed", "timeout"].includes(c.status)) {
      if (c.status !== "acked") throw new Error(`${label} → ${c.status} (${c.code ?? ""} ${c.msg ?? ""})`);
      console.log(`✓ ${label} → acked`);
      return c;
    }
    await sleep(1000);
  }
  throw new Error(`${label} did not settle within ${timeoutMs}ms`);
}

async function waitRelAlt(id, target, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { vehicle } = await api(`/api/control-center/vehicles/${id}`);
    if (vehicle.state && vehicle.state.pos.rel >= target) return;
    await sleep(1000);
  }
  throw new Error(`relative altitude never reached ${target}m`);
}

(async () => {
  const v = await findVehicle();
  console.log(`Vehicle ${v.name} (${v.id})`);
  const online = await waitOnline(v.id);
  console.log(`✓ online — mode ${online.state?.mode}, GPS fix ${online.state?.gps.fix}`);

  await sendAndWait(v.id, { type: "set_mode", mode: "GUIDED" }, "set_mode GUIDED");
  await sendAndWait(v.id, { type: "arm" }, "arm");
  await sendAndWait(v.id, { type: "takeoff", alt: 10 }, "takeoff 10");
  await waitRelAlt(v.id, 8);
  console.log("✓ climbed above 8m");

  const cur = (await api(`/api/control-center/vehicles/${v.id}`)).vehicle.state.pos;
  await sendAndWait(v.id, { type: "goto", lat: cur.lat + 0.0003, lon: cur.lon, alt: 10 }, "goto");
  await sendAndWait(v.id, { type: "rtl" }, "rtl");

  console.log("\n✅ smoke test passed");
})().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
