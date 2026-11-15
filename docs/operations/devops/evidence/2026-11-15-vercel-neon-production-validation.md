# Vercel + Neon Production Runtime, Release & Recovery Validation Record

Date: 2026-11-15

## 1. Mandated Production Stack

| Layer | Canonical Target | Cost Tier |
|---|---|---|
| **Production Web App** | **Vercel** (`school-sis-web` → `https://school-sis-web.vercel.app`, region `sin1`) | `₹0 / $0` Free Tier |
| **Production Marketing Site** | **Vercel** (`school-sis-website` → `https://school-sis-website.vercel.app`, region `sin1`) | `₹0 / $0` Free Tier |
| **Production Database** | **Neon Serverless PostgreSQL** + `pgvector` (pooled runtime + platform roles; direct migration role in GitHub Actions only) | `₹0 / $0` Free Tier |
| **Rate Limiting & Background Queue** | **Neon PostgreSQL** (`RATE_LIMIT_BACKEND=postgres`, `JOB_QUEUE_MODE=database`) | `₹0 / $0` Free Tier |
| **CI/CD, Cron & Android Builds** | **GitHub Actions Free** (`ci.yml`, `e2e.yml`, `deploy-production.yml`, `deploy-website.yml`, `jobs-dispatch.yml`, `mobile-android-apk.yml`, `recovery-rehearsal.yml`) | `₹0 / $0` Public Repo |

---

## 2. Live Production Endpoint & Security Header Evidence (`sin1`)

Verified directly against live production on `2026-11-15`:

- **Product Liveness (`GET https://school-sis-web.vercel.app/api/health`):**
  - HTTP `200 OK`
  - Payload: `{"status":"ok","service":"school-sis-web","region":"sin1","commit":"df7b6f486353e65181ccf3c201c77b9103a7af5a"}`
- **Readiness Gate (`GET https://school-sis-web.vercel.app/api/ready`):**
  - Unauthenticated probe: HTTP `401 Unauthorized` (fail-closed bearer check).
  - Authenticated candidate + canonical probes inside `Production Release` (`scripts/verify-deployment.mjs` in run [`43630386472`](https://github.com/singhaditya21/school-sis/actions/runs/43630386472)): HTTP `200 OK`, `status: "ready"`, `checks.database.status: "healthy"`, `checks.migrations.reason: "current"`, `checks.tenantContext.bypassVerified: false`, `checks.integrations.mockConnectionCount: 0`.
- **Marketing Lead Surface (`HEAD https://school-sis-website.vercel.app/book-demo`):**
  - HTTP `200 OK` from Vercel `sin1`
  - Enforced per-request nonce `Content-Security-Policy` (no `unsafe-inline` / `unsafe-eval` in `script-src`), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.

---

## 3. Secret-Free GitHub & Vercel Environment Contract Inventory

Names only (values are never logged or committed; sensitive values are verified programmatically inside `deploy-production.yml`):

- **Repository Secret (1):** `JOB_DISPATCH_SECRET` (authenticates scheduled `jobs-dispatch.yml` against `/api/jobs/dispatch`).
- **Protected `production` Environment Secrets (6):**
  - `METRICS_TOKEN` (≥ 32 chars; authenticates `/api/ready` and `/api/metrics`)
  - `NEON_API_KEY` (creates pre-migration recovery branch checkpoints)
  - `NEON_PRODUCTION_DIRECT_URL` (direct non-pooler migration/DDL connection; never exposed to Vercel runtime)
  - `TENANT_CONTEXT_SIGNING_SECRET` (HMAC transaction-local RLS context signing key, SHA-256 matched against `PRODUCTION_TENANT_CONTEXT_SIGNING_SECRET_SHA256`)
  - `VERCEL_AUTOMATION_BYPASS_SECRET` (staged candidate deployment verification before alias promotion)
  - `VERCEL_TOKEN` (immutable CLI build/deploy/alias/rollback control)
- **Protected `production` Environment Variables (2):** `TENANT_CONTEXT_AUDIENCE`, `TENANT_CONTEXT_SIGNING_KEY_ID`.
- **Repository Variables (22):** `NEON_DATABASE_NAME`, `NEON_MIGRATION_ROLE`, `NEON_PLATFORM_ROLE`, `NEON_PREVIEW_DATABASE_NAME`, `NEON_PREVIEW_MIGRATION_ROLE`, `NEON_PREVIEW_PLATFORM_ROLE`, `NEON_PREVIEW_PROJECT_ID`, `NEON_PREVIEW_RUNTIME_ROLE`, `NEON_PREVIEW_TEMPLATE_BRANCH_ID`, `NEON_PRODUCTION_BRANCH_ID`, `NEON_PROJECT_ID`, `NEON_RUNTIME_ROLE`, `PREVIEW_TENANT_CONTEXT_SIGNING_SECRET_SHA256`, `PRODUCTION_TENANT_CONTEXT_SIGNING_SECRET_SHA256`, `PRODUCTION_URL`, `VERCEL_ORG_ID`, `VERCEL_PREVIEW_APP_URL_TEMPLATE`, `VERCEL_PREVIEW_ORG_ID`, `VERCEL_PREVIEW_PROJECT_ID`, `VERCEL_PROJECT_ID`, `VERCEL_WEBSITE_PROJECT_ID`, `WEBSITE_PRODUCTION_URL`.
- **Database 3-Role Separation Enforced (`deploy-production.yml`):**
  1. `DATABASE_URL` on Vercel → Neon `-pooler` + `school_sis_runtime` (`NOBYPASSRLS`, `NOSUPERUSER`, `FORCE ROW LEVEL SECURITY` across all tenant tables).
  2. `PLATFORM_DATABASE_URL` on Vercel → Neon `-pooler` + `school_sis_platform` (control-plane role, pairwise-distinct password).
  3. `DIRECT_URL` in GitHub Actions migration step only → direct Neon host + migration/DDL role (`DIRECT_URL` is strictly forbidden on Vercel).

---

## 4. Automated CI/CD, Recovery Checkpoint & Scheduler Evidence

| Gate / Workflow | Verified Run | Outcome |
|---|---|---|
| **CI/CD Pipeline** (`ci.yml`) | [`43629903802`](https://github.com/singhaditya21/school-sis/actions/runs/43629903802) | Passed `audit:ci`, workflow tests, unit + architecture tests, real Postgres 158-table RLS isolation test, SQL `PREPARE` audit, typecheck, lint, build, and bundle budget. |
| **Playwright E2E Suite** (`e2e.yml`) | [`43629903920`](https://github.com/singhaditya21/school-sis/actions/runs/43629903920) | Passed full browser E2E suite against a freshly migrated PostgreSQL database. |
| **Production Release** (`deploy-production.yml`) | [`43630386472`](https://github.com/singhaditya21/school-sis/actions/runs/43630386472) | Passed `.vercel/output` zero-credential scan, created Neon recovery checkpoint artifact `neon-pre-migration-recovery-checkpoint-43630386472-1`, applied locked `db:migrate:deploy -- --target production`, verified staged candidate `/api/ready`, promoted to `school-sis-web.vercel.app`, and verified canonical `/api/ready`. |
| **Website Production Release** (`deploy-website.yml`) | [`43630294918`](https://github.com/singhaditya21/school-sis/actions/runs/43630294918) | Deployed and verified `https://school-sis-website.vercel.app`. |
| **Background Job Dispatcher** (`jobs-dispatch.yml`) | [`43635613285`](https://github.com/singhaditya21/school-sis/actions/runs/43635613285) | Scheduled waking-hours IST cron authenticated via `JOB_DISPATCH_SECRET` and processed due Neon `background_jobs` / `notification_outbox` batches. |
| **Neon Recovery Rehearsals** (`recovery-rehearsal.yml`) | [`43227970386`](https://github.com/singhaditya21/school-sis/actions/runs/43227970386), [`43016511346`](https://github.com/singhaditya21/school-sis/actions/runs/43016511346), [`43001271055`](https://github.com/singhaditya21/school-sis/actions/runs/43001271055), [`42996814601`](https://github.com/singhaditya21/school-sis/actions/runs/42996814601), [`42995510113`](https://github.com/singhaditya21/school-sis/actions/runs/42995510113) | Five consecutive green Neon branch-restore + rollback rehearsals. |

---

## 5. Optional External Vendor Credentials (`₹0` Free-Tier Posture)

By design on the `₹0 / $0` free-tier posture, optional third-party vendor keys ship **fail-closed / inert** (`mockConnectionCount: 0`, never mocked in production) until an operator supplies credentials per [`docs/operations/GO_LIVE_INTEGRATIONS.md`](../../GO_LIVE_INTEGRATIONS.md):

- **Payments (Razorpay / Stripe):** Webhook HMAC verification, INR pinning, row-locked ledger idempotency, and approved refund/waiver workflows are live in code; live merchant gateway UAT activates when school/company merchant keys are configured.
- **Notifications (`EMAIL`, `SMS`, `WHATSAPP`, `PUSH`):** Outbox, signed delivery webhooks (`/api/webhooks/whatsapp`, `/api/webhooks/sms`), per-channel operator metrics (`/api/operator/console`, `school_sis_notification_outbox_by_channel`), and `₹0` SMTP/Resend/FCM/WAHA adapters are live in code; external dispatch activates per channel when provider env vars are set.
- **Marketing Lead CRM (`LEAD_CRM_WEBHOOK_URL`):** Leads persist encrypted in Neon (`/hq/leads`) with `crm_status = 'INTERNAL_QUEUE'` by default at `₹0`, with optional Google Sheets + email forwarding via [`ops/crm/google-apps-script-lead-webhook.gs`](../../../../ops/crm/google-apps-script-lead-webhook.gs) and Prometheus alerts in [`ops/observability/prometheus/lead-capture-alerts.yml`](../../../../ops/observability/prometheus/lead-capture-alerts.yml).
