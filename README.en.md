# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne is a personal action system that proactively helps users make trade-offs.

The repository has completed V0.1 M9, Daily Loop. In addition to the complete web
action and offline-sync workflow, it now includes a native Expo / React Native
client with transactional SQLite storage, quick capture, Today, Inbox, task
decisions, opportunistic automatic sync, and SecureStore credentials. The web
client now also provides a morning kickoff, daily capacity feedback, and Zen
single-task mode. Product and development documentation is available in `docs/`.

## Local Requirements

- Node.js 22.13 or later
- pnpm 11
- Java 17 or later
- Maven 3.6.3 or later
- Docker Desktop (required for running PostgreSQL locally)

## Common Commands

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm dev
```

Start the Android development server:

```bash
pnpm mobile:dev
```

Scan the terminal QR code with Expo Go on Android, or run
`pnpm mobile:android` when an Android emulator is configured. Use
`http://10.0.2.2:8080` to reach the local API from the Android emulator.
Physical devices need a LAN-accessible or public server URL configured on the
app's Settings tab.

Start the local database:

```bash
pnpm db:up
```

Start the server:

```powershell
$env:NEXTONE_ACCESS_TOKEN="replace-with-a-long-random-token"
pnpm server:run
```

The local default token, `nextone-local-dev-token`, is for development only.
Requests to `/api/v1/**` must use `Authorization: Bearer <token>`. The OpenAPI
file is served at `http://127.0.0.1:8080/openapi/nextone-v1.yaml`.

For environment variable examples, see `deploy/compose/.env.example` and
`apps/server/src/main/resources/application.yml`.

## Current Scope

- The web engineering baseline, local task kernel, Today page, execution board,
  project focus workflow, Daily Close, and Basic Review are implemented.
- M6 connects browser IndexedDB Outbox records to the server and adds sync
  status and conflict resolution at `/settings/sync`.
- M7 adds `/settings/general` and `/settings/data`. Import replacement creates
  a local restore point first.
- Clearing a local copy never deletes cloud data, and the browser cannot
  directly execute final account deletion.
- M8 adds native Android screens without WebView, a SQLite Outbox, foreground
  and network-recovery sync, and secure local credentials.
- M9 adds morning planning, daily capacity feedback, and Zen single-task mode.
- Standard OIDC authentication and Oracle deployment are planned for M10.
- The system does not depend on Supabase, Redis, message queues, or paid SaaS
  products.
