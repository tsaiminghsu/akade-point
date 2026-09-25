# Enterprise IoT Control Center

Real-time machine monitoring, a floor-plan editor, alerts, analytics and
history for claw-machine / arcade store operators.

Split out of the `akade-point` monorepo (see tag `pre-split` there for the
combined history). It has no product relationship to the Akade Point card
collection app it used to share a Next.js application with.

## What it shares with Akade Point

Nothing in code — but the two apps sign in the **same LINE accounts against the
same two DynamoDB tables**:

| Table | Role |
|---|---|
| `akade-auth` | NextAuth adapter store, plus the runtime LINE channel credentials (`lib/auth/lineRuntimeConfig.ts`) |
| `akade-users` | User profiles; the `isAdmin` flag on a user is what gates this app |

The seventeen `akade-cc-*` tables belong to this app alone. Grant an admin with
`node scripts/set-admin.mjs`. The **editor UI** for LINE channel credentials
lives in the Akade Point app's `/admin/line-auth-settings`; this app only reads
what that page writes.

## Routes

`/` redirects to `/iot-control-center`, which holds dashboard, `machines`,
`claw-machines`, `vehicles`, `stores`, `alerts`, `analytics`, `history`,
`editor` (floor-plan) and `settings` / `users`. `/login` is a LINE sign-in page
outside the shell.

**Claw machine setup** (`claw-machines`) keeps one 飛絡力-style board config
plus claw / stock / chute per machine in `akade-cc-claw-configs`, with a 3D
simulator to try it (three.js + Rapier, copied from akade-point's
`/games/claw-machine`), revision-checked saves, and copy-to-many. Each
machine's ESP32 pulls its board settings from `/api/device/machines/config`
(machine device token `mt_…`, ETag/304) and reports back; with
`CLAW_CONFIG_NOTIFY=iot|mqtt` a save also sends an MQTT notice to
`claw/{machineId}/config` so the board pulls within about a second
(`npm run mqtt:dev` runs a local broker). Reference firmware is in
`firmware/esp32-claw-config/`. See `docs/claw-machine-configs.md` and
`docs/claw-machine-esp32.md`.

The **Vehicles** module (drones/rovers via MissionPlanner + companion boards)
adds device-side routes under `/api/device/vehicles/**` — authenticated by a
companion device token, not the admin check — and a Python companion bridge in
`companion/`. It runs entirely over HTTPS in local dev; AWS IoT Core MQTT is an
optional low-latency command channel in production (`VEHICLE_TRANSPORT=iot`,
`IOT_DATA_ENDPOINT`). See `docs/vehicles-overview.md`.

Outside production the admin check is bypassed (`requireAdminOrDevBypass` in
`lib/session.ts`, mirrored in `app/iot-control-center/layout.tsx`), so a fresh
dev machine can open the app without a LINE login. Production always enforces it.
The device-token check (`requireDeviceToken`) has no such bypass.

## Documentation

User- and integrator-facing docs live in `docs/`: `user-guide.md`,
`permissions.md` (role matrix, not yet implemented), `api-reference.md`,
`claw-machine-configs.md`, `claw-machine-esp32.md`, and the
`vehicles-*.md` set (overview, message contract, data model, security, IoT
provisioning, companion setup, local dev & verification) plus
`companion-esp32.md`.

## Local development

DynamoDB Local needs a JRE and the AWS jar unpacked into `.dynamodb-local/`
(gitignored) — download `dynamodb_local_latest.zip` from
`https://s3.us-west-2.amazonaws.com/dynamodb-local/`.

```bash
npm install
npm run dynamodb:local                 # terminal 1 — serves on :8500

# terminal 2, once per fresh .dynamodb-local-data/
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/create-tables.mjs
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8500 node scripts/seed-control-center-local.mjs

cp .env.local.example .env.local       # set DYNAMODB_LOCAL_ENDPOINT there
npm run dev:next
```

`npm run dev` runs Next and DynamoDB Local together.

## Internationalisation

`next-intl` with three locales — `zh-TW` (default), `en-US`, `ja-JP` — in
`messages/control-center/`. The active locale comes from the `cc-locale`
cookie (`i18n/request.ts`); the appearance settings page sets it.

## Checks

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest — geometry, simulation, batching, stores, claw sim
npm run build
```
