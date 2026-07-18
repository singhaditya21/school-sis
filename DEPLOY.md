# Deployment — the one true topology

This repo is a pnpm/turbo monorepo, but **only one thing is deployed as the product**:

```
apps/web  ──►  Vercel (project "school-sis-web", Root Directory = apps/web)
                 │
                 └──►  Neon Postgres (pooled URL at runtime, direct URL for migrations)
```

That's it. There is no gateway, no separate API server, no container in the deploy path.

## How a deploy works
1. Push to `main` → Vercel builds `apps/web` using `apps/web/vercel.json`:
   - `buildCommand: pnpm --filter @school-sis/web run vercel-build`
   - `vercel-build.mjs` runs **`db:migrate:prod` first** (production deploys only), then `next build`.
   - Migrations are applied automatically **iff `DIRECT_URL` is set** in the Vercel Production env; otherwise it warns and skips (see `apps/web/scripts/vercel-build.mjs`).
2. Background jobs + the notification outbox run via the Vercel cron in `apps/web/vercel.json`
   (`/api/jobs/dispatch`). Off-Vercel, call the same endpoint from any scheduler.

## Required environment (the complete must-have set)
Validated by `pnpm --filter @school-sis/web infra:check --strict`. See `apps/web/.env.example`
for the full REQUIRED-vs-OPTIONAL contract. The 8 required:

`DATABASE_URL` · `DIRECT_URL` · `SESSION_SECRET` · `PII_ENCRYPTION_KEY` (or `ENCRYPTION_KEY`) ·
`NEXT_PUBLIC_APP_URL` · `TENANT_BASE_HOSTS` · `JOB_DISPATCH_SECRET` · `CRON_SECRET`

Everything else (payments, notifications, storage, metrics, AI agents, backups) is **opt-in**.

- `DATABASE_URL` → Neon **pooled** host (`...-pooler...`), `sslmode=require`.
- `DIRECT_URL` → Neon **direct** host (same host **without** `-pooler`), `sslmode=require`.

## What is NOT deployed from this pipeline
- `apps/website` — marketing site (deployed separately, if at all).
- `apps/mobile` — prototype; not production-packaged.
- `services/` (Go gateway, Python agents, Rust inference) — **not wired into any build or deploy.**
  The web app talks to an optional external agent service via `AGENT_SERVICE_URL` when
  `AI_FEATURES_ENABLED=true`; these in-repo services are not that deployment.
- `Dockerfile`, `docker-compose.yml`, `prometheus.yml`, `alert*.yml` — **local/experimental tooling only**,
  not the production runtime.

## Local development
```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill the REQUIRED section
pnpm --filter @school-sis/web run db:migrate    # apply schema to your local/dev DB
pnpm --filter @school-sis/web run dev
```

## Schema / migrations
- Source of truth: Drizzle schema in `packages/api/src/db/schema/`.
- Ordered migrations: `apps/web/drizzle/*.sql` applied by `drizzle-kit migrate`.
- Generate a new migration after editing the schema: `pnpm --filter @school-sis/web run db:generate`.
  (Do **not** hand-write migration SQL — it re-introduces snapshot drift.)
