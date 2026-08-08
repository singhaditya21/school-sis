# School SIS DevOps & Deployment Guide

This guide covers local operations, database migrations, environment configuration, and the Vercel deployment workflow for School SIS.

For a new development machine, start with
[Continue School SIS on another laptop](../NEW_LAPTOP_SETUP.md). Commands in this
guide describe operator concerns; do not place production credentials or data in
the repository.

## Local Setup

Prerequisites:

- Node.js 24 (see `.nvmrc`)
- pnpm 9.15.9
- PostgreSQL 16 + pgvector for the full local runtime

Install and run:

```bash
pnpm install --frozen-lockfile
pnpm local:setup
pnpm dev
```

## Database Management

The production database is Neon Postgres with `pgvector`. The ORM and migration system is Drizzle.

Schema source:

```text
packages/api/src/db/schema/
```

Migration output:

```text
apps/web/drizzle/
```

Common commands from the repository root:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

Local/prototype schema push:

```bash
pnpm db:push
```

`db:push` is guarded. It is blocked in production and against remote databases unless `ALLOW_REMOTE_DB_PUSH=true` is set intentionally for non-production prototyping.

This checkout does not ship a `db:migrate:prod` shortcut. Production migrations
must use the reviewed deployment runbook for the target environment; do not run
an ad-hoc migration from a newly configured laptop.

Rules:

- Use `DATABASE_URL` for app runtime.
- Use `DIRECT_URL` for migrations, backups, and restore drills.
- Runtime RLS context uses `SET LOCAL` in the same transaction as each protected query, so `DATABASE_URL` supports direct or transaction-pooled connections.
- Set `DATABASE_SSL_MODE=verify-full` (the remote default). Use `require` only as a documented provider compatibility waiver.
- Do not use Neon pooler URLs for `DIRECT_URL`.

## Environment Variables

Use `apps/web/.env.example` as the canonical template.

Minimum production variables:

```env
DATABASE_URL=postgresql://...neon.tech/db
DIRECT_URL=postgresql://...neon.tech/db
DATABASE_SSL_MODE=verify-full
SESSION_SECRET=replace_with_at_least_32_random_characters
PII_ENCRYPTION_KEY=replace_with_at_least_32_random_characters
NEXT_PUBLIC_APP_URL=https://school-sis-web.vercel.app
TENANT_BASE_HOSTS=school-sis-web.vercel.app
INTEGRATIONS_MODE=live
JOB_QUEUE_MODE=database
JOB_DISPATCH_SECRET=replace_with_at_least_32_random_characters
CRON_SECRET=replace_with_at_least_32_random_characters
METRICS_TOKEN=replace_with_at_least_32_random_characters
RATE_LIMIT_BACKEND=postgres
RATE_LIMIT_MEMORY_MAX_ENTRIES=10000
CSP_ENFORCE=true
```

Leave external notification channels and online payments unconfigured until real provider credentials are present. Never set an integration or notification provider to `mock` in production. Production enforces the nonce CSP by default; `CSP_ENFORCE=false` is only a temporary rollback while investigating `/api/security/csp-report`, and must be restored to `true` after remediation. Import the rate-limit dashboard and alert rules from `ops/observability` when the production monitoring target is selected.

This checkout does not ship a standalone `infra:check` command. Use
`apps/web/.env.example` as the contract, keep values in the deployment provider,
and rely on production startup validation plus the `/api/ready` check.

## Vercel Deployment

Deploy from the repository root only.

```bash
pnpm dlx vercel --prod --yes
```

The Vercel project root is `apps/web`. That project setting and its secrets are
external deployment configuration; there is no tracked `vercel.json` in this
checkout. Verify the project dashboard before a production deployment:

- Project: `school-sis-web`
- Build command: `pnpm --filter @school-sis/web run build`
- Install command: `pnpm install --frozen-lockfile`
- Primary region: `iad1`

Run the deploy command from the repository root. Do not run `vercel` from `apps/web`; that can target a stale local project link.

## Storage and CDN

Cloudflare R2 is the preferred S3-compatible store. AWS S3 is a fallback.

R2:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=school-sis-uploads
STORAGE_CDN_BASE_URL=https://cdn.example.com
```

AWS fallback:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=school-sis-uploads
```

Uploads are tenant-prefixed and retrieved through authenticated signed URLs at `/api/files/...`.

## Backups and Restore Drills

This checkout does not ship `backup:create` or `backup:restore` shortcuts. Use
the approved database-provider backup and restore procedure for the target
environment, and verify a restore in an isolated database before relying on it.

Backup files contain sensitive data. Store production dumps outside the repository.

## CI Expectations

CI should pass:

```bash
pnpm test:architecture
pnpm test:unit
pnpm build
pnpm perf:bundle
pnpm --filter @school-sis/web run perf:load -- --dry-run
pnpm --filter @school-sis/web exec drizzle-kit check
pnpm --filter @school-sis/web exec eslint src --quiet
```

Deployments should occur only after reviewed migrations are applied or confirmed unnecessary.

## Testing and Quality

See [../TESTING_QUALITY_ARCHITECTURE.md](../TESTING_QUALITY_ARCHITECTURE.md) for the unit, E2E, coverage, and CI quality gate model.

## Performance and Scale

See [../PERFORMANCE_SCALE_ARCHITECTURE.md](../PERFORMANCE_SCALE_ARCHITECTURE.md) for query/index hygiene, rate limiting, caching, bundle budgets, and load-test commands.

Production auth rate limiting uses Upstash Redis when configured and the shared Postgres `rate_limit_buckets` fallback otherwise. Set these when available:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Background Jobs

Jobs and notifications are persisted in Postgres. Run the dispatcher with a service bearer token:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/jobs/dispatch" \
  -H "Authorization: Bearer $JOB_DISPATCH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":25,"notificationLimit":50}'
```

Use `JOB_QUEUE_MODE=database`; the web runtime uses the built-in Postgres dispatcher.

## Observability & SRE

Core checks:

```bash
curl "$NEXT_PUBLIC_APP_URL/api/health"
curl "$NEXT_PUBLIC_APP_URL/api/ready" -H "Authorization: Bearer $METRICS_TOKEN"
curl "$NEXT_PUBLIC_APP_URL/api/metrics" -H "Authorization: Bearer $METRICS_TOKEN"
curl "$NEXT_PUBLIC_APP_URL/api/sre/status" -H "Authorization: Bearer $METRICS_TOKEN"
```

Dead-lettered jobs and notifications automatically create SRE incidents. External monitors can create incidents with `POST /api/sre/incidents` using the same bearer token.
