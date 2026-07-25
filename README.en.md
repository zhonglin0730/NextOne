# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne is a personal action system that proactively helps users make trade-offs.

The repository has completed V0.1 M5, Server Persistence. The web app provides
quick capture, daily plans, the execution board, project focus, Daily Close,
and Basic Review. The server now provides PostgreSQL persistence, Flyway,
closed single-user authentication, core domain APIs, Bootstrap, stable error
codes, and an OpenAPI contract. Product and development documentation is
available in `docs/`.

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
- M5 adds PostgreSQL server persistence. Connecting browser IndexedDB Outbox
  records to the server remains part of M6.
- Android, standard OIDC authentication, and Oracle deployment are planned for
  later milestones.
- The system does not depend on Supabase, Redis, message queues, or paid SaaS
  products.
