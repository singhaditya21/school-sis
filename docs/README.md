# ScholarMind Documentation Index

All project documentation is organized under five domain directories in `docs/`, paired with root entrypoints ([`README.md`](../README.md) and [`RUNNING.md`](../RUNNING.md)).

## Directory Structure

| Category | Path | Scope |
|---|---|---|
| **Product & Roadmap** | [`docs/product/`](./product/) | Live issue tracker mapping, launch gates, and phased delivery roadmap. |
| **Architecture** | [`docs/architecture/`](./architecture/) | Core SIS domain contracts, 144-table RLS matrix, LCNC platform, AI copilot, auth, jobs, payments, BI, observability, and test gates. |
| **Guides** | [`docs/guides/`](./guides/) | School admin/teacher user guide and developer API/webhook integration reference. |
| **Operations & Audits** | [`docs/operations/`](./operations/) | Vercel + Neon CI/CD runbook, ₹0/go-live integration setup, PII encryption & key rotation, tenant isolation audit, release evidence, and point-in-time audits. |
| **Go-To-Market (GTM)** | [`docs/gtm/`](./gtm/) | Pilot scope freeze, Group Finance Control Pilot, approved public-claims register, buyer research, and evidence log. |

---

## 1. Product & Roadmap (`docs/product/`)

- [`ISSUES_AND_ROADMAP.md`](./product/ISSUES_AND_ROADMAP.md) — Prioritized launch gates (P0–P2), closed remediation history, LCNC platform status, and pilot scope boundaries.

## 2. System Architecture (`docs/architecture/`)

- [`CORE_SIS_DOMAIN_ARCHITECTURE.md`](./architecture/CORE_SIS_DOMAIN_ARCHITECTURE.md) — Shared K-12 domain contracts (`packages/api/src/domain/core-sis`).
- [`LCNC_PLATFORM_ARCHITECTURE.md`](./architecture/LCNC_PLATFORM_ARCHITECTURE.md) — Low-Code / No-Code platform: 19 system objects + EAV custom objects, layouts, OWD sharing, formula/validation rules, approvals, Flow Builder, BI dashboards, Web-to-Object portals, and `.scholarmind.json` packaging.
- [`RLS_POLICY_MATRIX.md`](./architecture/RLS_POLICY_MATRIX.md) — Enforced 144-table PostgreSQL `FORCE ROW LEVEL SECURITY` inventory verified by `pnpm audit:rls-matrix`.
- [`IDENTITY_ARCHITECTURE.md`](./architecture/IDENTITY_ARCHITECTURE.md) — Iron Session authentication, MFA, SSO/SCIM/LTI boundaries, and session revocation.
- [`FINE_GRAINED_AUTHORIZATION_ARCHITECTURE.md`](./architecture/FINE_GRAINED_AUTHORIZATION_ARCHITECTURE.md) — Central RBAC, field-level security (FLS), object-level security (OLS), and route access matrices.
- [`WORKFLOW_APPROVAL_ENGINE_ARCHITECTURE.md`](./architecture/WORKFLOW_APPROVAL_ENGINE_ARCHITECTURE.md) — Reusable multi-role approval state machine (`packages/api/src/workflows/approvals`).
- [`PAYMENTS_BILLING_ARCHITECTURE.md`](./architecture/PAYMENTS_BILLING_ARCHITECTURE.md) — Tenant-owned fee ledger, Razorpay/Stripe checkout & webhooks, idempotency, and approved refunds/waivers.
- [`BACKGROUND_JOBS_NOTIFICATIONS_ARCHITECTURE.md`](./architecture/BACKGROUND_JOBS_NOTIFICATIONS_ARCHITECTURE.md) — Postgres-backed job queue, transactional notification outbox, and `/api/jobs/dispatch`.
- [`AI_AGENT_ARCHITECTURE.md`](./architecture/AI_AGENT_ARCHITECTURE.md) — Native TypeScript bounded Copilot (`apps/web/src/lib/ai`), human-in-the-loop approvals, token budgets, and ₹0 free-tier LLM provider chain.
- [`REPORTING_ANALYTICS_BI_ARCHITECTURE.md`](./architecture/REPORTING_ANALYTICS_BI_ARCHITECTURE.md) — Governed BI semantic catalog, drag-and-drop report builder, scheduled reports, and PII-gated exports.
- [`ADMIN_OPERATOR_CONSOLE_ARCHITECTURE.md`](./architecture/ADMIN_OPERATOR_CONSOLE_ARCHITECTURE.md) — Platform & tenant operator control plane (`/operator`, `/hq`, `/settings/integrations`).
- [`OBSERVABILITY_SRE_ARCHITECTURE.md`](./architecture/OBSERVABILITY_SRE_ARCHITECTURE.md) — Structured logging, `/api/health` & `/api/ready`, SLOs, rate-limit alerts, and incident tracking.
- [`PERFORMANCE_SCALE_ARCHITECTURE.md`](./architecture/PERFORMANCE_SCALE_ARCHITECTURE.md) — Atomic Postgres/Redis rate limiting, composite tenant indexes, cache profiles, bundle budgets, and load testing.
- [`TESTING_QUALITY_ARCHITECTURE.md`](./architecture/TESTING_QUALITY_ARCHITECTURE.md) — Static CI ratchets (`pnpm audit:ci`), unit/architecture suites, RLS isolation tests, and Playwright E2E.

## 3. Guides (`docs/guides/`)

- [`guides/user-guide/README.md`](./guides/user-guide/README.md) — End-user guide for school administrators, finance teams, teachers, and parents.
- [`guides/api/README.md`](./guides/api/README.md) — Developer & integration guide for REST data APIs, webhooks, and provider adapters.

## 4. Operations, Security & Audits (`docs/operations/`)

- [`operations/devops/README.md`](./operations/devops/README.md) — Canonical GitHub Actions → Neon + Vercel (`sin1`) CI/CD pipeline, environment contract, and rollback runbook.
- [`operations/devops/PILOT_PROVISIONING.md`](./operations/devops/PILOT_PROVISIONING.md) — Step-by-step tenant onboarding and pilot environment provisioning.
- [`operations/GO_LIVE_INTEGRATIONS.md`](./operations/GO_LIVE_INTEGRATIONS.md) — Activating optional production integrations (including 100% ₹0 / $0 free-tier options).
- [`operations/PII_ENCRYPTION_ROLLOUT.md`](./operations/PII_ENCRYPTION_ROLLOUT.md) — Deterministic AEAD field encryption rollout across national IDs and contact columns.
- [`operations/PII_KEY_ROTATION.md`](./operations/PII_KEY_ROTATION.md) — Zero-downtime dual-key rotation runbook for `PII_ENCRYPTION_KEY`.
- [`operations/TENANT_ISOLATION_DEEPENING_AUDIT.md`](./operations/TENANT_ISOLATION_DEEPENING_AUDIT.md) — Deep-dive audit of transaction-bound HMAC RLS context and query-builder scoping.
- [`operations/devops/evidence/`](./operations/devops/evidence/) — Production readiness, migration transition, and token reconciliation evidence records.
- [`operations/audits/`](./operations/audits/) — Point-in-time historical audits ([`2026-07-04-full-application-audit.md`](./operations/audits/2026-07-04-full-application-audit.md) and remediated [`2026-04-26-pre-remediation-sast-report.md`](./operations/audits/2026-04-26-pre-remediation-sast-report.md)).

## 5. Go-To-Market & Governance (`docs/gtm/`)

- [`gtm/README.md`](./gtm/README.md) — GTM execution overview.
- [`gtm/sales/README.md`](./gtm/sales/README.md) — Approved public-claims register enforced by `pnpm audit:claims`.
- [`gtm/GROUP_FINANCE_CONTROL_PILOT.md`](./gtm/GROUP_FINANCE_CONTROL_PILOT.md) — Commercial pilot Wedge specification.
- [`gtm/PILOT_SCOPE_FREEZE.md`](./gtm/PILOT_SCOPE_FREEZE.md) — Scope-freeze rules governing feature additions during initial pilots.
- [`gtm/PILOT_DATA_REQUEST.md`](./gtm/PILOT_DATA_REQUEST.md), [`gtm/BUYER_INTERVIEW_GUIDE.md`](./gtm/BUYER_INTERVIEW_GUIDE.md), [`gtm/COMPETITOR_TEST_SCORECARD.md`](./gtm/COMPETITOR_TEST_SCORECARD.md), [`gtm/OPERATING_OWNERS.md`](./gtm/OPERATING_OWNERS.md), [`gtm/EVIDENCE_AND_DECISION_LOG.md`](./gtm/EVIDENCE_AND_DECISION_LOG.md).

---

## 100% Free-Tier (`₹0 / $0`) Development & Deployment Stack

ScholarMind is engineered so development, CI/CD, hosting, database, mobile builds, AI, and messaging can run at **₹0 / $0 cost**:

| Layer | Free-Tier Stack | Repository Wiring |
|---|---|---|
| **Local Dev & DB** | Local Node 24 + Homebrew PostgreSQL 16 + `pgvector` (`./.pgdata`) | `pnpm local:setup` & `pnpm dev` — zero cloud dependencies |
| **Source & CI/CD** | **GitHub Free** (public repo: unlimited `ubuntu-latest` Actions minutes + Environments) | `.github/workflows/ci.yml`, `e2e.yml`, `production-release.yml`, `website-release.yml` |
| **Cron Scheduler** | **GitHub Actions Cron** + Postgres `background_jobs` (`JOB_QUEUE_MODE=database`) | `.github/workflows/jobs-dispatch.yml` (waking-hours IST schedule preserves Neon compute) |
| **Mobile Builds** | **GitHub Actions Android Gradle** (zero paid Expo EAS build credits) | `.github/workflows/mobile-android-apk.yml` |
| **Web Hosting** | **Vercel Hobby / Free** (`sin1` Mumbai/Singapore edge) | `school-sis-web` + `school-sis-website` |
| **Database & Rate Limits** | **Neon Free Tier** (Postgres 16 + `pgvector`, scale-to-zero, `RATE_LIMIT_BACKEND=postgres`) | `apps/web/drizzle/0000`–`0020` + Postgres `rate_limit_buckets` (no paid Redis required) |
| **AI Copilot** | **Google Gemini Free Tier**, **Groq Free**, **Cerebras Free**, or self-hosted **Ollama** | `apps/web/src/lib/ai/provider.ts` (`GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OLLAMA_BASE_URL`) |
| **WhatsApp** | Self-hosted open-source **WAHA** or **Evolution API** in Docker (`₹0` BSP markup) | `ops/whatsapp/docker-compose.whatsapp-free.yml` (`WHATSAPP_PROVIDER=waha`) |
| **Email & Push** | **SMTP** (Gmail App Password / Brevo Free 300/day) or **Resend Free** + **Firebase FCM** (`₹0`) | `EMAIL_PROVIDER=smtp\|resend`, `PUSH_PROVIDER=firebase` |
| **Object Storage & Bot Guard** | **Cloudflare R2 Free** (10 GB/mo, zero egress) + **Cloudflare Turnstile** (`₹0` CAPTCHA) | `R2_*` + `TURNSTILE_SECRET_KEY` |
| **Lead CRM** | Built-in **HQ Lead Queue** (`/hq/leads` in Neon) + optional Google Apps Script webhook | `apps/web/src/app/api/leads/route.ts` |
