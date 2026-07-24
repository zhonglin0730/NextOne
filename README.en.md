# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne is a personal action system that proactively helps users make trade-offs.

The repository is currently at the V0.1 engineering baseline stage. Product and
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

- The current baseline includes the web app, shared TypeScript packages,
  Spring Boot, and local PostgreSQL.
- Android, automatic synchronization, production authentication, and Oracle
  deployment are planned for later milestones.
- The system does not depend on Supabase, Redis, message queues, or paid SaaS
  products.
