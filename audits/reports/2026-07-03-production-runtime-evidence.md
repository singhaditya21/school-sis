# Production Runtime Evidence - 2026-07-03

This evidence note records the production-runtime work performed for the P0 roadmap slice on July 3, 2026. It intentionally contains no secret values.

## Vercel Production Env Inventory

Project inspected from the repository root:

- Vercel project: `school-sis-web`
- Vercel root directory: `apps/web`
- Production URL: `https://school-sis-web.vercel.app`

Production variables confirmed present after this pass:

- `DATABASE_URL`
- `DIRECT_URL`
- `SESSION_SECRET`
- `PII_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`
- `METRICS_TOKEN`
- `JOB_DISPATCH_SECRET`
- `CRON_SECRET`
- `TENANT_BASE_HOSTS`
- `BACKUP_RETENTION_DAYS`

Variables added in this pass:

- `DIRECT_URL`
- `NEXT_PUBLIC_APP_URL`
- `TENANT_BASE_HOSTS`
- `CRON_SECRET`
- `BACKUP_RETENTION_DAYS`

Important validation note: Vercel stores newly added production values as Sensitive env vars. `vercel env pull --environment=production` confirms the names but returns empty strings for those sensitive values, so local strict validation cannot prove their value length after creation without re-exposing the secrets. Presence was verified through `vercel env ls production --format json`.

## Remaining Env Blockers

The following real provider/storage values are still missing from Vercel production and must not be mocked for launch:

Payment:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Notification provider launch scope:

- `REQUIRED_NOTIFICATION_CHANNELS`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY` or `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- `SMS_PROVIDER`
- `MSG91_AUTH_KEY` or `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

Storage:

- Cloudflare R2 preferred: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `STORAGE_CDN_BASE_URL`
- AWS fallback: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

Recommended but still missing:

- `BACKUP_RESTORE_DRILL_AT`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_SENTRY_DSN`

## Scheduler Decision

Current deployed cron config is Hobby-compatible:

- Path: `/api/jobs/dispatch`
- Schedule: `0 0 * * *`
- Auth: `Authorization: Bearer $CRON_SECRET`

Production decision: use Vercel Pro Cron for minute-level dispatch before launch, then change the schedule to `* * * * *`. Vercel Hobby rejects minute-level cron expressions, so the current daily schedule is intentionally deploy-safe but not sufficient for production notification/job latency.

Fallback if Vercel Pro is not approved: use an external scheduler that can send `GET /api/jobs/dispatch` with `Authorization: Bearer $CRON_SECRET` every minute.

## Backup Readiness Evidence

Installed matching local client tooling:

- `postgresql@18` through Homebrew
- Used `/opt/homebrew/opt/postgresql@18/bin/pg_dump`
- Used `/opt/homebrew/opt/postgresql@18/bin/pg_restore`

Non-destructive backup-readiness check performed:

- Pulled production env into `/tmp`.
- Derived the direct Neon host from the existing `DATABASE_URL` for this local check.
- Ran schema-only custom-format `pg_dump`.
- Ran `pg_restore --list` against the custom archive.
- Deleted the temporary env file and dump afterward.

Result:

- Schema dump archive size: `537619` bytes
- `pg_restore --list` output lines: `1155`
- No production data rows were restored or committed to the repository.

Full restore drill status:

- Not completed in this pass.
- Reason: a safe restore target, such as a Neon branch or isolated restore database, was not available in the current environment.
- Do not restore into production. Complete the full drill only after creating a disposable restore target and recording its target URL, owner, start/end time, command evidence, and validation result.
