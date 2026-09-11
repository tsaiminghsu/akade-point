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

The nine `akade-cc-*` tables belong to this app alone. Grant an admin with
`node scripts/set-admin.mjs`. The **editor UI** for LINE channel credentials
lives in the Akade Point app's `/admin/line-auth-settings`; this app only reads
what that page writes.

## Routes

`/` redirects to `/iot-control-center`, which holds dashboard, `machines`,
`stores`, `alerts`, `analytics`, `history`, `editor` (floor-plan) and
`settings` / `users`. `/login` is a LINE sign-in page outside the shell.

Outside production the admin check is bypassed (`requireAdminOrDevBypass` in
`lib/session.ts`, mirrored in `app/iot-control-center/layout.tsx`), so a fresh
dev machine can open the app without a LINE login. Production always enforces it.

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
npm test             # vitest — geometry, simulation, batching, stores
npm run build
```
