# School SIS DevOps & Deployment Guide

This guide covers local operations, database migrations, environment configuration, and the Vercel deployment workflow for School SIS.

## Local Setup

Prerequisites:

- Node.js 20+
- pnpm 9.15.9+
- Docker and Docker Compose for optional local services

Install and run:

```bash
pnpm install
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

Production migration:

```bash
DIRECT_URL="postgresql://..." CONFIRM_PRODUCTION_MIGRATION=school-sis pnpm db:migrate:prod
```

Rules:

- Use `DATABASE_URL` for app runtime.
- Use `DIRECT_URL` for migrations, backups, and restore drills.
- Include `sslmode=require` or `sslmode=verify-full`.
- Do not use Neon pooler URLs for `DIRECT_URL`.

## Environment Variables

Use `apps/web/.env.example` as the canonical template.

Minimum production variables:

```env
DATABASE_URL=postgresql://...neon.tech/db?sslmode=require
DIRECT_URL=postgresql://...neon.tech/db?sslmode=require
SESSION_SECRET=replace_with_at_least_32_random_characters
PII_ENCRYPTION_KEY=replace_with_at_least_32_random_characters
NEXT_PUBLIC_APP_URL=https://school-sis-web.vercel.app
INTEGRATIONS_MODE=mock
PAYMENT_PROVIDER_MODE=mock
JOB_QUEUE_MODE=database
JOB_DISPATCH_SECRET=replace_with_at_least_32_random_characters
METRICS_TOKEN=replace_with_at_least_32_random_characters
EMAIL_PROVIDER=mock
SMS_PROVIDER=mock
WHATSAPP_PROVIDER=mock
PUSH_PROVIDER=mock
```

Validate the production contract:

```bash
pnpm infra:check
NODE_ENV=production pnpm --filter @school-sis/web run infra:check -- --strict
```

## Vercel Deployment

Deploy from the repository root only.

```bash
pnpm dlx vercel --prod --yes
```

The Vercel project root is `apps/web`, so `apps/web/vercel.json` is the deployment source of truth:

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

Create an operator backup:

```bash
DIRECT_URL="postgresql://..." pnpm backup:create
```

Restore drill:

```bash
DIRECT_URL="postgresql://..." CONFIRM_RESTORE=school-sis pnpm backup:restore -- ./backups/neon/file.dump
```

Backup files contain sensitive data. Store production dumps outside the repository.

## CI Expectations

CI should pass:

```bash
pnpm build
pnpm --filter @school-sis/web exec drizzle-kit check
pnpm --filter @school-sis/web exec eslint src --quiet
```

Deployments should occur only after reviewed migrations are applied or confirmed unnecessary.

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
