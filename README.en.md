# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne is a personal action system that proactively helps users make trade-offs.

The repository has completed V0.1 M4, Daily Close and Basic Review. In addition
to quick capture, daily plans, the execution board, and project focus, it now
supports processing unfinished daily work one item at a time, explicitly
continuing tomorrow or removing an item from today, review decision queues,
review dates, and a basic activity log. Data is stored in IndexedDB while task
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

- The web engineering baseline, local task kernel, Today page, execution board,
  project focus workflow, Daily Close, and Basic Review are implemented.
- M1–M4 data is stored in browser IndexedDB. The Outbox is not connected to
  server synchronization yet.
- Android, automatic synchronization, production authentication, and Oracle
  deployment are planned for later milestones.
- The system does not depend on Supabase, Redis, message queues, or paid SaaS
  products.
