# School SIS Production Runtime & Infrastructure

Last updated: 2026-07-03

This is the production operating contract for the School SIS platform. The active target stack is Vercel + Neon + Drizzle; legacy hosting/database targets are not part of this repository's production path.

## Production Targets

| Layer | Standard |
| --- | --- |
| Web runtime | Vercel, deployed from the repository root |
| App project | `school-sis-web` |
| Stable URL | `https://school-sis-web.vercel.app` |
| Database | Neon Postgres with `pgvector` |
| ORM/migrations | Drizzle from `apps/web/drizzle/` |
| Object storage | Cloudflare R2 preferred; AWS S3-compatible fallback |
| File retrieval | Authenticated `/api/files/...` signed retrieval route |
| Background jobs | Durable Postgres job ledger plus authenticated dispatcher |
| Notifications | Tenant-scoped notification outbox with mock-first providers |
| Observability | Health/readiness, protected Prometheus metrics, SRE incidents |
| Primary serverless region | `iad1` until a different Neon primary region is selected |

## Vercel Hardening

- Deploy from the repository root only so the root `.vercel` link selects `school-sis-web`.
- The Vercel project root is `apps/web`; `apps/web/vercel.json` is the source of truth.
- Do not run `vercel` from `apps/web`; that can bind to the stale local `web` project link.
- Production builds run `pnpm --filter @school-sis/web run build`.
- Next.js emits standalone output and suppresses the `X-Powered-By` header.
- App-wide security headers are defined in `apps/web/next.config.ts`.
- Static build asset caching is left to Next.js/Vercel defaults.
- Runtime routes that touch DB or secrets remain Node/serverless routes, not Edge routes.

## Neon Runtime Contract

Use two database URLs:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime pooled Neon connection for the Vercel app |
| `DIRECT_URL` | Direct Neon connection for Drizzle migrations and backups |

Rules:

- Both URLs must include `sslmode=require` or `sslmode=verify-full`.
- `DIRECT_URL` must not be the Neon pooler host.
- Runtime code normalizes production `DATABASE_URL` to `sslmode=require` if the setting is missing.
- `drizzle-kit push` is blocked against production and remote databases unless explicitly allowed for non-production prototyping.
- Production migrations use `pnpm db:migrate:prod` with `CONFIRM_PRODUCTION_MIGRATION=school-sis`.

## Migration Discipline

1. Change schema in `packages/api/src/db/schema/`.
2. Generate migration SQL:

```bash
pnpm db:generate
```

3. Review generated SQL under `apps/web/drizzle/`.
4. Apply to Neon with the direct URL:

```bash
DIRECT_URL="postgresql://..." CONFIRM_PRODUCTION_MIGRATION=school-sis pnpm db:migrate:prod
```

5. Deploy the app after the migration succeeds:

```bash
pnpm dlx vercel --prod --yes
```

Do not run `db:push` for production. `db:push` is reserved for local/prototype databases.

## Environment Contract

Minimum production variables:

| Variable | Requirement |
| --- | --- |
| `DATABASE_URL` | Neon pooled URL with SSL |
| `DIRECT_URL` | Neon direct URL with SSL |
| `SESSION_SECRET` | 32+ random characters |
| `PII_ENCRYPTION_KEY` or `ENCRYPTION_KEY` | 32+ random characters |
| `NEXT_PUBLIC_APP_URL` | Production HTTPS URL |
| `TENANT_BASE_HOSTS` | Comma-separated production tenant base domains |
| `METRICS_TOKEN` | 32+ random characters |
| `JOB_DISPATCH_SECRET` | 32+ random characters for manual or external scheduler `POST /api/jobs/dispatch` |
| `CRON_SECRET` | 32+ random characters for Vercel Cron `GET /api/jobs/dispatch` |
| `BACKUP_RETENTION_DAYS` | Positive integer, usually `30` or higher |
| `AGENT_API_TOKEN` | 32+ random characters if agent service is enabled |
| `AGENT_WEBHOOK_SECRET` | 32+ random characters if agent webhook is enabled |
| `IOT_INGEST_SECRET` | 32+ random characters if IoT ingest is enabled |
| `CEREBRAS_API_KEY` | Required only when Copilot is enabled |

Payment launch requires real provider values:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Background jobs default to `JOB_QUEUE_MODE=database`. Notification providers default to mock mode with `EMAIL_PROVIDER=mock`, `SMS_PROVIDER=mock`, `WHATSAPP_PROVIDER=mock`, and `PUSH_PROVIDER=mock`. Production launch must set `REQUIRED_NOTIFICATION_CHANNELS` to the intended launch scope and configure real providers for those channels.

Observability endpoints:

- `GET /api/health` is a minimal public liveness check.
- `GET /api/ready`, `GET /api/metrics`, `GET /api/sre/status`, and `POST /api/sre/incidents` require `Authorization: Bearer $METRICS_TOKEN` in production.
- `GET /api/sre/incidents` is session-authenticated for tenant admins; incident lifecycle updates require platform admin.

The job dispatcher can be called by Vercel Cron using `GET` and `CRON_SECRET`:

```bash
curl "$NEXT_PUBLIC_APP_URL/api/jobs/dispatch" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Manual or external scheduler dispatch can use `POST` and `JOB_DISPATCH_SECRET`:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/jobs/dispatch" \
  -H "Authorization: Bearer $JOB_DISPATCH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":25,"notificationLimit":50}'
```

Current repository config uses a Hobby-compatible Vercel Cron schedule of `0 0 * * *` so deployments stay green. Production launch requires minute-level dispatch with Vercel Pro Cron (`* * * * *`) or an external scheduler that can run every minute.

Validate the runtime contract:

```bash
pnpm infra:check
NODE_ENV=production pnpm --filter @school-sis/web run infra:check -- --strict
```

## Storage and CDN Strategy

Cloudflare R2 is preferred because it is S3-compatible and can sit behind Cloudflare CDN. AWS S3 remains supported.

Preferred R2 variables:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=school-sis-uploads
STORAGE_CDN_BASE_URL=https://cdn.example.com
```

AWS fallback variables:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=school-sis-uploads
```

File keys must remain tenant-prefixed. Uploads return the authenticated `/api/files/{tenantId}/...` retrieval URL rather than a public bucket URL. Sensitive school files should not be served from a public bucket.

## Backup and Restore

Neon managed backups should be enabled in the Neon project. The repository also includes operator scripts for explicit restore drills:

```bash
DIRECT_URL="postgresql://..." pnpm backup:create
```

Restore is intentionally destructive and requires an explicit confirmation:

```bash
DIRECT_URL="postgresql://..." CONFIRM_RESTORE=school-sis pnpm backup:restore -- ./backups/neon/school-sis.dump
```

Operational policy:

- Keep daily backups for at least `BACKUP_RETENTION_DAYS=30`.
- Run one restore drill before any major launch or migration wave.
- Store generated dumps outside the repository for production data.
- Never commit backup files or raw dumps.
- Use a `pg_dump`/`pg_restore` client version that is at least as new as the Neon Postgres server version. The current Neon server reports Postgres `18.4`, so local backup drills require PostgreSQL 18 client tools such as `/opt/homebrew/opt/postgresql@18/bin/pg_dump`.
- The July 3, 2026 evidence check completed a schema-only custom dump and `pg_restore --list` validation without restoring data. The full restore drill remains open until a disposable Neon branch or isolated restore target is available.

## Region Decision

Current default:

- Vercel serverless region: `iad1`
- Neon primary region: should be colocated as closely as possible with the Vercel runtime region

If the customer base moves primarily to India/APAC, move both Vercel and Neon runtime regions together. Do not move only one layer; that creates high database latency.

## Production Checklist

- `pnpm infra:check` passes.
- `pnpm --filter @school-sis/web exec drizzle-kit check` passes.
- Pending migrations are reviewed and applied with `DIRECT_URL`.
- `pnpm --filter @school-sis/web build` passes.
- Vercel production deployment succeeds from repo root.
- `/login` returns HTTP 200 on the stable production URL.
- A recent backup or restore drill exists before irreversible schema changes.
