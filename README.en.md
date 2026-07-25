# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne is a personal action system that proactively helps users make trade-offs.

The repository has completed V0.1 M2, Today and Execution. In addition to quick
capture, the inbox, and task details, it now supports daily plans, an execution
board, WIP limits, waiting, and Someday. Data is stored in IndexedDB while task
events and Outbox records are written alongside each change. Product and
development documentation is available in `docs/`.

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

```bash
pnpm server:run
```

For environment variable examples, see `deploy/compose/.env.example` and
`apps/server/src/main/resources/application.yml`.

## Current Scope

- The web engineering baseline, local task kernel, Today page, and execution
  board are implemented. Projects, Review, and other top-level pages will be
  enabled milestone by milestone.
- M1/M2 data is stored in browser IndexedDB. The Outbox is not connected to
  server synchronization yet.
- Android, automatic synchronization, production authentication, and Oracle
  deployment are planned for later milestones.
- The system does not depend on Supabase, Redis, message queues, or paid SaaS
  products.
