# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne is a personal project progression system: projects show the whole
picture, work packages define structure, and task states drive execution.

It is neither a traditional to-do list nor simply a smaller Trello. NextOne
starts with the outcome a project should achieve. Its project portfolio makes
progress and blockers visible; each project board organizes the
execution flow; Today holds a small set of daily commitments; and reviews keep
projects aligned over time. WIP limits, no-actionable-work alerts, and waiting-item
prompts still help users make trade-offs, but they serve project progression
rather than define the product as a task-decision tool.

The repository now provides a complete personal project progression workflow
for the web with offline sync, plus a native Expo / React Native client.
Implemented capabilities include the project portfolio, visual execution
progress, optional work-package breakdown, execution board, quick capture, Today, Inbox, lightweight Today
planning, Daily Close, basic reviews, Zen single-task mode, IndexedDB / SQLite
local storage, opportunistic automatic sync, and SecureStore credentials.
Product and development documentation is available in `docs/`.

## Core Workflow

1. Create a project and state the outcome it should achieve.
2. Create executable tasks on the project board. Add work packages only when
   a larger project needs stage or deliverable grouping.
3. Starting a task adds it to Today automatically; tasks can also be planned
   into Today before they are started.
4. Complete, pause, or mark work as waiting so progress and blockers stay true.
5. Use Daily Close and periodic reviews to handle waiting, stalled, and
   no-actionable-work projects.

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
For Oracle ARM production deployment, backup, and recovery, see
[`docs/M10-Oracle-ARM-部署与恢复.md`](docs/M10-Oracle-ARM-部署与恢复.md).

## Current Scope

- The web engineering baseline, local task kernel, Today page, execution board,
  project portfolio, optional work-package structure, visual project progress, Daily Close,
  and Basic Review are implemented.
- M6 connects browser IndexedDB Outbox records to the server and adds sync
  status and conflict resolution at `/settings/sync`.
- M7 adds `/settings/general` and `/settings/data`. Import replacement creates
  a local restore point first.
- Clearing a local copy never deletes cloud data, and the browser cannot
  directly execute final account deletion.
- M8 adds native Android screens without WebView, a SQLite Outbox, foreground
  and network-recovery sync, and secure local credentials.
- M9 adds lightweight Today planning, daily capacity feedback, and Zen single-task mode.
- M10 now includes ARM64 images, production Compose, Caddy HTTPS, backup and
  restore, and minimal monitoring configuration. Real deployment validation is
  waiting for the Oracle ARM host and domain.
- The personal edition currently uses a single-user long token. Standard OIDC
  remains a later account-system enhancement.
- The system does not depend on Supabase, Redis, message queues, or paid SaaS
  products.
