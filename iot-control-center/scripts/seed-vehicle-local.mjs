/**
 * Registers a demo SITL drone against a locally-running dev server and issues a
 * device token, then prints a ready-to-paste companion.toml. Goes through the
 * real API (the NODE_ENV dev bypass admits it) so it exercises the same paths a
 * browser would.
 *
 * Prereqs: DynamoDB Local + create-tables run, and `npm run dev:next` running.
 *   node scripts/seed-vehicle-local.mjs [baseUrl] [--rover] [--sitl]
 *
 *   --rover  a "SITL Rover" (companionId sitl-rover, direct link on :8766 so it
 *            can run next to the copter's companion)
 *   --sitl   mavlink_url for the Docker SITL harness (companion/sitl), which
 *            sends to udp :14540, instead of the fake autopilot's :14550
 */
const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const ROVER = args.includes("--rover");
const SITL = args.includes("--sitl");
const COMPANION_ID = ROVER ? "sitl-rover" : "sitl-copter";
const DIRECT_PORT = ROVER ? 8766 : 8765;

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
    body: JSON.stringify(
      ROVER
        ? { name: "SITL Rover", type: "rover", companionId: COMPANION_ID, notes: "ArduPilot Rover SITL" }
        : { name: "SITL Copter", type: "drone", companionId: COMPANION_ID, notes: "ArduCopter SITL" }
    ),
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
console.log(SITL ? `mavlink_url = "udpin:0.0.0.0:14540"` : `mavlink_url = "udpin:127.0.0.1:14550"`);
console.log(`telemetry_interval_s = 1.0`);
// SITL simulates a 3S pack (12.6 V full).
console.log(`battery_cells = 3`);
console.log(`tlog_dir = "tlogs"`);
if (issued.directKey) {
  // Local dev: the page is http://localhost, so a plain ws:// direct link works.
  await api(`/api/control-center/vehicles/${vehicle.id}`, {
    method: "PATCH",
    body: JSON.stringify({ directUrl: `ws://127.0.0.1:${DIRECT_PORT}` }),
  });
  console.log("");
  console.log("[direct]");
  console.log("enabled = true");
  console.log(`host = "127.0.0.1"`);
  console.log(`port = ${DIRECT_PORT}`);
  console.log(`ticket_key = "${issued.directKey}"`);
}
console.log("--------------------------------------------------------------");
if (SITL) {
  console.log("\nStart ArduPilot SITL + mavlink-router (docs/vehicles-local-dev-and-verification.md):");
  console.log(`  docker run --rm -p 5760:5760 -p 14550:14550/udp -e VEHICLE=${ROVER ? "rover" : "copter"} akade-sitl`);
} else {
  console.log("\nNo flight controller? Run the fake autopilot next to the companion:");
  console.log(`  python -m vehicle_companion.tools.fake_autopilot --vehicle ${ROVER ? "rover" : "copter"} --to 127.0.0.1:14550`);
}
console.log("\nThe token above is shown once. Re-run to rotate (old token is revoked).");
