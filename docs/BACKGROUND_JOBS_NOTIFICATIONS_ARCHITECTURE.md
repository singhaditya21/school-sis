# Background Jobs & Notification Architecture

School SIS now treats background work and notification delivery as durable, tenant-owned database workflows.

## Implemented Controls

- **Durable job ledger:** `background_jobs` stores task name, payload, queue, schedule time, attempts, idempotency key, result, and dead-letter state.
- **Attempt history:** `background_job_attempts` records each execution attempt with worker id, result, error, and timing.
- **Notification outbox:** `notification_outbox` stores tenant-scoped email, SMS, WhatsApp, push, and in-app delivery intents before provider execution.
- **Delivery audit events:** `notification_delivery_events` captures provider status, provider message id, metadata, and failure reason.
- **Tenant RLS:** all new job/outbox/event tables have forced row-level security. Platform jobs use `tenant_id IS NULL` and are visible only through RLS bypass.
- **Idempotency:** jobs and notifications use partial unique indexes for tenant/platform idempotency keys.
- **Retry and dead-letter:** dispatcher failures move jobs through `FAILED` with exponential backoff and finally `DEAD_LETTER`.
- **Mock-first providers:** email, SMS, WhatsApp, push, and in-app delivery default to mock/database providers. Real providers are opt-in env choices.
- **Authenticated dispatch:** `/api/jobs/dispatch` requires `Authorization: Bearer $JOB_DISPATCH_SECRET`.
- **Tenant-safe status:** `/api/jobs/[jobId]` returns only jobs owned by the caller's tenant, with platform-only access for platform jobs.

## Runtime Flow

1. App code calls `enqueueTenantJob`, `enqueuePlatformJob`, or `enqueueNotification`.
2. A durable row is written in Postgres with tenant context or platform RLS bypass.
3. A scheduler calls `POST /api/jobs/dispatch`.
4. The dispatcher claims due jobs with `FOR UPDATE SKIP LOCKED`.
5. Tenant jobs execute under `runWithTenantContext`; platform jobs execute under RLS bypass.
6. Notifications are delivered through the outbox processor and recorded as delivery events.
7. Linked communication messages move from `QUEUED` to `SENT`, `DELIVERED`, or `FAILED`.

## Environment Requirements

```env
JOB_QUEUE_MODE=database
JOB_DISPATCH_SECRET=replace_with_at_least_32_random_characters
EMAIL_PROVIDER=mock
SMS_PROVIDER=mock
WHATSAPP_PROVIDER=mock
PUSH_PROVIDER=mock
```

Optional:

- Set `EMAIL_PROVIDER=smtp|resend`, `SMS_PROVIDER=msg91|twilio`, or `PUSH_PROVIDER=firebase` only after real provider secrets are configured.

## Operations

Recommended production scheduler:

```bash
curl -X POST https://school-sis-web.vercel.app/api/jobs/dispatch \
  -H "Authorization: Bearer $JOB_DISPATCH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":25,"notificationLimit":50}'
```

Run frequency:

- Every minute for normal notification and webhook workloads.
- More frequently only if provider rate limits and database capacity are sized for it.

## Remaining Hardening

- Add a Vercel Cron or external scheduler entry that calls `/api/jobs/dispatch`.
- Add operator dashboards for queued, failed, and dead-letter jobs.
- Add provider-specific inbound webhook handling for delivery receipts.
- Add rate limiting and per-tenant notification quotas.
- Add alerting when dead-letter counts rise above threshold.
