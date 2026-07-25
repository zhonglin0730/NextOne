# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne is a personal action system that proactively helps users make trade-offs.

The repository has completed V0.1 M7, Settings, Data Safety, and
Internationalization. In addition to the complete action and offline-sync
workflow, the web app now provides locale and action-rule preferences, JSON
import/export with preview, automatic restore points, local-copy cleanup, and
a protected account-deletion request API. Product and development
documentation is available in `docs/`.

## Local Requirements

- Node.js 22.12 or later
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
- Android, standard OIDC authentication, and Oracle deployment are planned for
  later milestones.
- The system does not depend on Supabase, Redis, message queues, or paid SaaS
  products.
