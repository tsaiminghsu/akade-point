#!/usr/bin/env node
/**
 * A stand-in for a claw machine's ESP32. It pulls
 * /api/device/machines/config the way firmware/esp32-claw-config does,
 * "applies" the settings (prints them) and reports back, so the whole
 * delivery flow can be tried without hardware.
 *
 * Usage:
 *   CLAW_DEVICE_TOKEN=mt_... node scripts/claw-device-sim.mjs [options]
 *
 * Options:
 *   --base URL       API origin (default http://localhost:3000)
 *   --token TOKEN    board token (default: $CLAW_DEVICE_TOKEN)
 *   --once           pull once, report, and exit
 *   --fail CODE      report every new config as failed with CODE (e.g. BOARD_TIMEOUT)
 *   --interval S     seconds between pulls (default: what the server says)
 *   --fw VERSION     X-Firmware header (default claw-sim/1.0)
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const base = (opt("base", "http://localhost:3000") ?? "").replace(/\/$/, "");
const token = opt("token", process.env.CLAW_DEVICE_TOKEN);
const once = flag("once");
const failCode = opt("fail", null);
const intervalOverride = opt("interval", null);
const fw = opt("fw", "claw-sim/1.0");

if (!token) {
  console.error("Missing token: pass --token or set CLAW_DEVICE_TOKEN (issue one on the claw machine setup page).");
  process.exit(2);
}

const headers = { Authorization: `Bearer ${token}`, "X-Firmware": fw };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString();

/** sha of the last config this "board" processed (applied or rejected); sent as If-None-Match. */
let lastSeen = "";

async function report(payload, st, code, msg) {
  const res = await fetch(`${base}/api/device/machines/config/ack`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ v: 1, sha: payload.sha, rev: payload.rev, st, ...(code ? { code } : {}), ...(msg ? { msg } : {}) }),
  });
  if (!res.ok) throw new Error(`ack HTTP ${res.status}`);
}

async function pullOnce() {
  const res = await fetch(`${base}/api/device/machines/config`, {
    headers: lastSeen ? { ...headers, "If-None-Match": `"${lastSeen}"` } : headers,
  });
  if (res.status === 401) {
    console.error(`[${stamp()}] 401: token rejected (revoked or wrong). Stopping.`);
    process.exit(1);
  }
  if (res.status === 304) {
    console.log(`[${stamp()}] 304 no change (sha ${lastSeen})`);
    return null;
  }
  if (!res.ok) throw new Error(`pull HTTP ${res.status}`);

  const payload = await res.json();
  if (payload.v !== 1 || !payload.settings) {
    lastSeen = payload.sha ?? lastSeen;
    await report(payload, "failed", "UNSUPPORTED_VERSION", `v=${payload.v}`);
    return payload;
  }
  const s = payload.settings;
  console.log(
    `[${stamp()}] new config rev ${payload.rev} sha ${payload.sha}: ` +
      `coins ${s.coinsPerPlay}, time ${s.playTime}s, V ${s.strongPower}/${s.midPower}/${s.weakPower}/${s.guaranteePower}, ` +
      `guarantee ${s.guaranteeN}, drop line ${s.dropLine}s`
  );
  lastSeen = payload.sha;
  if (failCode) {
    await report(payload, "failed", failCode, "simulated failure");
    console.log(`[${stamp()}]   reported FAILED ${failCode}`);
  } else {
    await report(payload, "applied");
    console.log(`[${stamp()}]   reported applied`);
  }
  return payload;
}

let poll = 30;
for (;;) {
  try {
    const payload = await pullOnce();
    if (payload?.poll) poll = payload.poll;
  } catch (err) {
    console.error(`[${stamp()}] ${err.message}; retrying`);
  }
  if (once) break;
  await sleep(1000 * Number(intervalOverride ?? poll));
}
