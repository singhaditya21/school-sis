# ScholarMind Operations Guide

This document describes the operations that are available in the repository today. Production cloud deployment remains gated until infrastructure, provider, backup, restore, and ownership evidence is committed and verified.

## Supported runtime

ScholarMind currently runs as a local Next.js application with a local PostgreSQL 16 database and pgvector. It does not currently have a supported Vercel, Neon, Render, R2, or AWS production deployment definition.

Prerequisites:

- Node.js 20+
- Corepack with pnpm 9.15.9
- PostgreSQL 16 with pgvector

```bash
corepack enable
pnpm install
pnpm local:setup
pnpm dev
```

See [../../RUNNING.md](../../RUNNING.md) for database paths, test accounts, and the exact local lifecycle.

## Database operations

The schema source is `packages/api/src/db/schema/`; the migration chain is under `apps/web/drizzle/`.

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:studio
pnpm db:down
```

`pnpm db:reset` is destructive and is intended only for an explicitly selected local development database.

Rules:

- Use `DATABASE_URL` for the application and migrations in the current local runtime.
- Remote database connections default to certificate verification.
- Tenant-bearing tables must be added to the RLS policy matrix and non-superuser isolation test.
- Destructive migrations must pass `pnpm audit:migrations`.
- Production migrations, backups, and restores must not be inferred from undocumented commands.

## Environment

Use `apps/web/.env.example` as the canonical template. External payments, messaging, storage, AI, and webhook delivery remain unavailable until their required credentials and readiness checks pass.

Production must never enable mock integrations or notification providers. A missing provider must yield an explicit unavailable state rather than a simulated success.

## Scheduler and background jobs

Jobs and notifications are persisted in PostgreSQL. Run one local dispatch cycle with:

```bash
pnpm jobs:tick
```

Run the local scheduler loop with:

```bash
pnpm scheduler
```

The scheduler is a required production workload, but no production scheduler deployment is defined yet.

## Validation

```bash
pnpm build
pnpm lint
pnpm test:unit
pnpm test:architecture
pnpm audit:ci
pnpm test:e2e:smoke
pnpm perf:bundle
pnpm perf:load -- --dry-run
```

The complete Playwright suite is currently separate from the required smoke gate while scheduled coverage is stabilized.

## Production target

The approved target architecture is a managed AWS deployment in Mumbai, but it is a roadmap item rather than current repository behavior. Its release gate requires reviewed infrastructure-as-code for:

- containerized Next.js workloads behind a load balancer, WAF, and CDN;
- PostgreSQL/pgvector, object storage, Redis, secrets, and encryption keys;
- scheduler ownership, logs, metrics, traces, alerts, and on-call routing;
- migration jobs, encrypted backups, restore drills, and rollback evidence;
- verified payment and notification providers;
- measured availability before any public SLO claim.

Until that evidence exists, local operation remains the only supported deployment and issue #18 remains open.

## Observability endpoints

When configured locally, the application exposes health, readiness, metrics, and SRE status endpoints. Protected operational endpoints require their documented bearer token; never publish them without authentication.

Rate-limit alert rules and the Grafana dashboard live under `ops/observability/` and should be imported only after a production monitoring owner and target are selected.

## Release rule

A capability may be enabled for production only when its application route, API, provider prerequisites, tests, documentation, and operational owner all agree on its readiness. Navigation visibility alone is never evidence of availability.
