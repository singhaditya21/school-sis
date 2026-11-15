# School SIS — Issues & Roadmap

> **Document version**: 2.9.0
> **Last updated**: 2026-11-15
> **Source of truth**: [`docs/operations/audits/2026-07-04-full-application-audit.md`](../operations/audits/2026-07-04-full-application-audit.md) and [`docs/operations/devops/evidence/2026-11-15-vercel-neon-production-validation.md`](../operations/devops/evidence/2026-11-15-vercel-neon-production-validation.md), verified against live production and `main` on 2026-11-15.
> **Mandated Production Stack (`₹0 / $0`)**: **Vercel** (`school-sis-web` + `school-sis-website`, `sin1`) is the canonical production application host and **Neon** (Serverless PostgreSQL + `pgvector`) is the canonical production database, orchestrated exclusively by **GitHub Actions Free** (`.agents/rules/production-stack.md`). Local development is local-only — see [RUNNING.md](../../RUNNING.md).

This roadmap is the human-readable index over the GitHub issue tracker, security/remediation history, and pilot execution boundaries.

## Executive summary

All engineering, security, database isolation, PII-at-rest encryption (`0009`–`0021`), CI/CD release gates, observability, and companion mobile test gates across Phases 0–2 are implemented and verified in production on **Vercel (`sin1`) + Neon PostgreSQL** at **`₹0 / $0` cost**:

- **Production Runtime & Recovery Proven (`#18`):** `deploy-production.yml` enforces 3-role Neon credential separation (`school_sis_runtime`, `school_sis_platform`, and CI-only migration role), `.vercel/output` zero-credential scanning, pre-migration Neon recovery checkpoints, locked migrations (`0000`–`0021`), and authenticated staged + canonical `/api/ready` verification (`mockConnectionCount: 0`), backed by 5 consecutive green `Recovery Rehearsal` runs ([validation record](../operations/devops/evidence/2026-11-15-vercel-neon-production-validation.md)).
- **PII Encryption Rollout Completed (`0009`–`0021`):** All 24 national, financial, and contact `*_enc` PII columns (plus `users.mfa_secret`) across `students`, `staff_profiles`, `visitors`, `guardians`, `admission_leads`, `alumni_profiles`, `host_families`, `health_records`, `users`, `tenants`, `messages`, `marketing_leads`, and `student_visas` have `*_enc` columns, dual-read (`COALESCE(*_enc, *)` + `decryptFieldTolerant`), encrypted writes, LCNC plaintext quarantine, backfill (`scripts/backfill-encrypt-pii-identifiers.ts`), and key-rotation coverage (`scripts/rotate-pii-encryption.ts`).
- **Notifications, Lead Capture & Gated Mobile Hardened (`#25`, `#31`, `#21`):** Unified channel readiness across Meta Cloud, WAHA, Evolution, SMTP, Resend, Twilio, MSG91, and FCM; operator console + Prometheus per-channel outbox metrics; Prometheus lead-capture counters/alerts (`ops/observability/prometheus/lead-capture-alerts.yml`) + `₹0` Google Apps Script CRM receiver (`ops/crm/google-apps-script-lead-webhook.gs`); and automated mobile Bearer-auth, HTTPS pinning, and bounded offline roll-call queue unit tests (`mobile-companion-security.test.ts`).

### Commercial pilot scope gate (effective 2026-08-21)

Until the first three paid design-partner pilots complete, active work is governed by [`PILOT_SCOPE_FREEZE.md`](../gtm/PILOT_SCOPE_FREEZE.md) and focused on the [`Group Finance Control Pilot`](../gtm/GROUP_FINANCE_CONTROL_PILOT.md): source-data import, fee-ledger normalization, reconciliation, receivables/exceptions, waiver/refund approvals, audit evidence, multi-campus executive reporting, native PDF exports, and demo safety. Store rollout of the mobile app, autonomous AI agents, and unrelated horizontal expansion remain intentionally gated.

| Milestone | Focus | Engineering / Code Status |
|---|---|---|
| [Phase 0 — Launch Blockers (P0)](https://github.com/singhaditya21/school-sis/milestone/1) | Production runtime, mock isolation & release gates | 🟢 Complete on Vercel + Neon ([evidence](../operations/devops/evidence/2026-11-15-vercel-neon-production-validation.md)) |
| [Phase 1 — Production Hardening (P1)](https://github.com/singhaditya21/school-sis/milestone/2) | CSP, RLS, rate limits, AI budgets, outbox & gated mobile | 🟢 Code & CI complete (optional vendor live drills per school) |
| [Phase 2 — Quality, Maintainability & Scale (P2)](https://github.com/singhaditya21/school-sis/milestone/3) | Debt ratchets, toolchain, Next.js 16, E2E & lead intake | 🟢 Complete |

**Status legend**: 🟢 Done (code & CI verified) · ⏸️ Gated by [`PILOT_SCOPE_FREEZE.md`](../gtm/PILOT_SCOPE_FREEZE.md) · 🔧 Optional operator vendor credential activation.

---

## Phase 0 — Launch blockers (P0) · [milestone](https://github.com/singhaditya21/school-sis/milestone/1)

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#17](https://github.com/singhaditya21/school-sis/issues/17) | Remove or hard-isolate mock/demo/fixture surfaces from runtime integration code | 🟢 Done | `integrations`, `security`, `notifications` |
| [#18](https://github.com/singhaditya21/school-sis/issues/18) | Capture strict production runtime evidence and add a strict infra release gate | 🟢 Done — Vercel (`sin1`) + Neon live, `/api/ready` + recovery checkpoints proven ([evidence](../operations/devops/evidence/2026-11-15-vercel-neon-production-validation.md)) | `infra`, `observability`, `database` |

## Phase 1 — Production hardening (P1) · [milestone](https://github.com/singhaditya21/school-sis/milestone/2)

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#20](https://github.com/singhaditya21/school-sis/issues/20) | Tighten Content-Security-Policy: remove script-src unsafe-inline/unsafe-eval | 🟢 Done | `security`, `frontend`, `payments` |
| [#21](https://github.com/singhaditya21/school-sis/issues/21) | Make the mobile app production-ready (real auth, secure payment context) or gate it | 🟢 Gated companion — Bearer auth, HTTPS origin pinning, bounded offline queue & CI unit tests verified; store release gated per [`PILOT_SCOPE_FREEZE.md`](../gtm/PILOT_SCOPE_FREEZE.md) | `mobile`, `payments`, `security` |
| [#23](https://github.com/singhaditya21/school-sis/issues/23) | Decide the Go gateway: secure it as a real edge or remove it from production | 🟢 Done (removed) | `services`, `security`, `rate-limiting` |
| [#24](https://github.com/singhaditya21/school-sis/issues/24) | Remove the unused legacy R2 storage adapter that uploads via unsigned raw fetch | 🟢 Done | `storage`, `security` |
| [#25](https://github.com/singhaditya21/school-sis/issues/25) | Provide notification provider evidence or disable unsupported channels | 🟢 Code & telemetry done — real adapters (SMTP/Resend, Twilio/MSG91, Meta/WAHA/Evolution, FCM), signed receipt webhooks, and operator/Prometheus channel metrics shipped; 🔧 live vendor keys optional per deployment | `notifications`, `integrations`, `observability` |
| [#26](https://github.com/singhaditya21/school-sis/issues/26) | Formalize RLS/database security: policy matrix, real Postgres isolation tests, bypass review, verify-full SSL, migration gates | 🟢 Done | `database`, `security`, `testing` |
| [#27](https://github.com/singhaditya21/school-sis/issues/27) | Stop tracking generated/session artifacts (.agents/\*_, _.tsbuildinfo, build.log, server.log) | 🟢 Done | `hygiene`, `devex` |
| [#28](https://github.com/singhaditya21/school-sis/issues/28) | Add AI eval suites, per-tenant token/cost budgets, model fallback, and red-team tests for agent/copilot | 🟢 Done | `ai`, `testing`, `rate-limiting` |
| [#29](https://github.com/singhaditya21/school-sis/issues/29) | Make rate limiting fail closed (or degrade stricter) on backend outage for public/AI endpoints | 🟢 Done | `rate-limiting`, `security`, `services` |
| [#42](https://github.com/singhaditya21/school-sis/issues/42) | Reimplement PDF generation and user/role management natively after Java backend removal | 🟢 Done | `payments`, `identity`, `security` |

## Phase 2 — Quality, maintainability & scale (P2) · [milestone](https://github.com/singhaditya21/school-sis/milestone/3)

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#30](https://github.com/singhaditya21/school-sis/issues/30) | Reduce static risk debt (console.\*, any, raw SQL, alerts) with downward-only CI thresholds | 🟢 Done | `hygiene`, `observability`, `devex` |
| [#31](https://github.com/singhaditya21/school-sis/issues/31) | Harden website lead capture: production API env, anti-bot controls, consent, CRM routing | 🟢 Done — server-proxied intake, honeypot/timing/Turnstile, rate limits, encrypted Neon `/hq/leads` queue, Prometheus metrics + alerts, and `₹0` Google Apps Script CRM webhook shipped | `website`, `integrations`, `observability` |
| [#32](https://github.com/singhaditya21/school-sis/issues/32) | Enforce pnpm toolchain via Corepack and a preflight guard; document in dev guide | 🟢 Done | `devex`, `infra`, `hygiene` |
| [#33](https://github.com/singhaditya21/school-sis/issues/33) | Migrate middleware to proxy convention and revisit static cache headers for Next.js 16 | 🟢 Done | `infra`, `devex` |
| [#34](https://github.com/singhaditya21/school-sis/issues/34) | Complete side-service test tooling and CI for Python/Go/Rust services | 🟢 Done (removed) | `testing`, `services`, `devex` |
| [#37](https://github.com/singhaditya21/school-sis/issues/37) | Stabilize the full Playwright E2E suite and restore reliable scheduled coverage | 🟢 Done | `testing`, `quality`, `ci` |

---

## Verified Delivery Milestones

### 1. Mandated Vercel + Neon Production Validation & PII Rollout Completion (2026-11-15)

- **Production Stack Mandate Codified (`.agents/rules/production-stack.md`):** Vercel (`school-sis-web` + `school-sis-website`) + Neon PostgreSQL (`pgvector`, Postgres rate limiting, Postgres job queue) + GitHub Actions Free (`₹0 / $0`).
- **#18 Production Proof Recorded:** Committed [`2026-11-15-vercel-neon-production-validation.md`](../operations/devops/evidence/2026-11-15-vercel-neon-production-validation.md) linking live `sin1` health/CSP checks, `Production Release` run `43630386472`, Neon pre-migration recovery checkpoint `neon-pre-migration-recovery-checkpoint-43630386472-1`, 5 `Recovery Rehearsal` runs, and scheduled `jobs-dispatch.yml` execution.
- **PII-at-Rest Encryption Completed (`0021_encrypt_remaining_contact_pii.sql`):** Added `tenants.phone_enc`, `messages.recipient_phone_enc`, and `messages.recipient_email_enc`; wired tolerant dual-reads and encrypted writes across school profile, compliance, campus queries, PDF receipts/report cards, teacher profile, onboarding/HQ provisioning, and `provision-pilot-group.ts`; and locked 100% schema `*_enc` parity across `backfill-encrypt-pii-identifiers.ts` and `rotate-pii-encryption.ts` in CI (`pii-rollout-and-observability.test.ts`).
- **#25, #31 & #21 Closed Out in Code & CI:**
  - Unified `/messages/compose` availability with `describeChannelReadiness` (enabling Meta Cloud, WAHA, and Evolution WhatsApp adapters when configured) and added `sent`, `delivered`, `suppressed`, and `byChannel` metrics to `/api/operator/console` + `school_sis_notification_outbox_by_channel`.
  - Added `school_sis_lead_capture_requests_total` and `school_sis_marketing_leads_crm` Prometheus metrics, alert rules (`ops/observability/prometheus/lead-capture-alerts.yml`), graceful `INTERNAL_QUEUE` handling when running pure Neon `/hq/leads`, and a fail-closed `₹0` Google Apps Script Sheets/email webhook (`ops/crm/google-apps-script-lead-webhook.gs`).
  - Added mobile unit test coverage (`mobile-companion-security.test.ts`) wired into both `pnpm test:unit` and `.github/workflows/mobile-android-apk.yml`.

### 2. LCNC & Drag-and-Drop Platform + Mobile Companion (2026-10-20)

- **LCNC Builders (`docs/architecture/LCNC_PLATFORM_ARCHITECTURE.md`):** Form & List Layout Designer (`/settings/objects/[id]`), Visual Workflow Automation Canvas (`/settings/automation/new`), Flow Builder (`/settings/flows`), OWD Sharing & Criteria Rules (`/settings/sharing`), Formula/Validation Rules, Multi-Step Approval Processes, Custom BI Report Builder (`/reports`), Web-to-Object Portals (`/settings/portals`), and `.scholarmind.json` App Packaging (`/settings/packages`).
- **Integrations Outbox Console & Mobile LCNC Parity:** `/settings/integrations` channel readiness & outbox retry UI, `GET /api/data` object discovery, `POST /api/auth/token` mobile sign-in, and `apps/mobile/screens/MetadataExplorerScreen.tsx`.

### 3. Security & Quality Foundation (2026-07-17 – 2026-10-18)

- **#17, #20, #26, #29, #30, #32, #33, #37, #42:** Centralized Iron Session RBAC/FLS/OLS, nonce CSP, atomic Postgres/Redis rate limiting with strict fallback, 144-table `FORCE ROW LEVEL SECURITY` verified by non-superuser PostgreSQL tests, native PDF generation, zero explicit `any` / `console.log` / `alert()` debt ratchets, and 19-test Playwright E2E suite.

---

## Post-Pilot Roadmap (Gated Until First 3 Paid Pilots Complete)

1. **Optional Live Vendor Activations ([`GO_LIVE_INTEGRATIONS.md`](../operations/GO_LIVE_INTEGRATIONS.md)):** Plug in school/company Razorpay or Stripe live keys, SMTP/Resend/FCM/WAHA/MSG91 credentials, Cloudflare Turnstile keys, and optional `LEAD_CRM_WEBHOOK_URL` as each pilot cohort requires.
2. **Deeper Domain State-Machine Adoption:** Route remaining legacy module actions through `packages/api/src/domain/core-sis` lifecycle contracts and expand domain-event outbox triggers.
3. **Destructive Legacy Column Cleanup:** After verifying zero remaining plaintext values across all environments, drop quarantined legacy plaintext PII columns via an approved maintenance window (`scripts/destructive-migration-maintenance.json`).
4. **Native Mobile Store Release:** Unfreeze store distribution only after pilot completion criteria in [`PILOT_SCOPE_FREEZE.md`](../gtm/PILOT_SCOPE_FREEZE.md) are met.
