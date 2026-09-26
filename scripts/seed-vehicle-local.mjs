/**
 * Registers a demo SITL drone against a locally-running dev server and issues a
 * device token, then prints a ready-to-paste companion.toml. Goes through the
 * real API (the NODE_ENV dev bypass admits it) so it exercises the same paths a
 * browser would.
 *
 * Prereqs: DynamoDB Local + create-tables run, and `npm run dev:next` running.
 *   node scripts/seed-vehicle-local.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const COMPANION_ID = "sitl-copter";

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

// Reuse an existing vehicle with this companionId, else create one.
const { vehicles } = await api("/api/control-center/vehicles");
let vehicle = vehicles.find((v) => v.companionId === COMPANION_ID);
if (vehicle) {
  console.log(`Vehicle "${vehicle.name}" already exists (${vehicle.id}).`);
} else {
  const created = await api("/api/control-center/vehicles", {
    method: "POST",
    body: JSON.stringify({ name: "SITL Copter", type: "drone", companionId: COMPANION_ID, notes: "ArduCopter SITL" }),
  });
  vehicle = created.vehicle;
  console.log(`+ vehicle "${vehicle.name}" (${vehicle.id})`);
}

const issued = await api(`/api/control-center/vehicles/${vehicle.id}/token`, {
  method: "POST",
  body: JSON.stringify({ label: "sitl" }),
});

console.log("\n--- companion.local.toml -------------------------------------");
console.log(`vehicle_id = "${vehicle.id}"`);
console.log(`api_base = "${BASE}"`);
console.log(`token = "${issued.token}"`);
console.log(`transport = "http"`);
console.log(`contract = 2`);
console.log(`mavlink_url = "udpin:127.0.0.1:14550"`);
console.log(`telemetry_interval_s = 1.0`);
console.log(`battery_cells = 4`);
console.log(`tlog_dir = "tlogs"`);
if (issued.directKey) {
  // Local dev: the page is http://localhost, so a plain ws:// direct link works.
  await api(`/api/control-center/vehicles/${vehicle.id}`, {
    method: "PATCH",
    body: JSON.stringify({ directUrl: "ws://127.0.0.1:8765" }),
  });
  console.log("");
  console.log("[direct]");
  console.log("enabled = true");
  console.log(`host = "127.0.0.1"`);
  console.log("port = 8765");
  console.log(`ticket_key = "${issued.directKey}"`);
}
console.log("--------------------------------------------------------------");
console.log("\nNo flight controller? Run the fake autopilot next to the companion:");
console.log("  python -m vehicle_companion.tools.fake_autopilot --vehicle copter --to 127.0.0.1:14550");
console.log("\nThe token above is shown once. Re-run to rotate (old token is revoked).");
