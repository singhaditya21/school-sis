# Full Application Deep Audit - 2026-07-04

## Executive Summary

This audit reviewed the full local application surface of the School SIS monorepo at `/Users/adityasingh/PersonalWork/school-sis` on branch `main`.

Current mainline status is strong from a build and CI perspective: local TypeScript, Jest, architecture tests, web build, website build, mobile TypeScript, and Rust compile/test checks passed. GitHub `main` was also checked and the latest `main` SHA was green for CI and E2E at the time of this audit. The repeated GitHub failure emails are explained by a failing Dependabot branch, not by the current `main` branch.

The application is not fully production-ready yet. The most important remaining blockers are not generic polish items; they are access-control consistency, removal or isolation of mock/demo surfaces, real production environment evidence, removal of operational HTTP endpoints, dynamic metadata permissions, and production readiness of peripheral services.

## Scope And Method

This was a static full-repo audit plus automated verification and targeted manual review of the highest-risk runtime paths.

Audited surfaces:

| Surface | Observed count or status |
| --- | ---: |
| Non-generated repo files scanned | About 1,012 |
| Non-generated lines counted | About 185,503 |
| Web app routes/pages/handlers under `apps/web/src/app` | 217 |
| Next.js pages | 145 |
| Next.js route handlers | 72 |
| Drizzle schema files | 46 |
| Drizzle tables | 145 |
| Estimated schema columns | About 1,686 |
| UI forms found by static scan | 19 |
| UI inputs found by static scan | 98 |
| UI selects found by static scan | 34 |
| UI textareas found by static scan | 9 |

Limitations:

- This is a deep source audit, not a formal proof that every line is defect-free.
- Production Vercel and Neon secrets were not available in the local shell, so strict production runtime evidence could not be re-proven locally.
- Browser/manual QA of every page was not performed in this pass.
- Python agent tests could not be run because `pytest` was not installed.
- Go gateway tests could not be run because `go` was not installed.

## Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| `git status --short --branch` | Pass | Clean `main...origin/main` during audit. |
| Local `main` vs `origin/main` SHA | Pass | Both pointed to `5cf02123feb4c1a4b83d72f5c06fdca2d5c0fc57`. |
| GitHub Actions for `main` | Pass | CI/CD Pipeline and E2E were green on `main`. |
| GitHub repeated failure source | Explained | Failures were on Dependabot branch `dependabot/npm_and_yarn/development-dependencies-fbc2b35fc2`, not `main`. |
| `pnpm audit:secrets` | Pass | Secret pattern scan passed. |
| `pnpm audit:hygiene` | Pass with gap | Gate passed but misses tracked `.agents`, `server.log`, `build.log`, and `apps/web/tsconfig.tsbuildinfo`. |
| `pnpm audit:ci` | Pass | No critical/high advisories; moderate and low advisories remain. |
| `pnpm --filter @school-sis/web exec tsc --noEmit --pretty false --incremental false` | Pass | Web TypeScript passed. |
| `pnpm --filter @school-sis/web run test:architecture` | Pass | Architecture tests passed. |
| `pnpm --filter @school-sis/web exec jest --runInBand` | Pass | 23 suites and 122 tests passed. |
| `pnpm --filter @school-sis/web run build` | Pass with warnings | Build passed; warned about Next middleware convention and static cache headers. |
| `pnpm --filter website run build` | Pass | Website build passed. |
| `pnpm --filter website exec tsc --noEmit --pretty false` | Pass | Website TypeScript passed. |
| `pnpm --filter mobile exec tsc --noEmit --pretty false` | Pass | Mobile TypeScript passed, but mobile is still prototype-grade. |
| `cargo test` in `services/inference` | Pass with warnings | Compiled; zero tests; unused-code warnings. |
| `pytest services/agents/tests -q` | Not run | `pytest` command missing. |
| `go test ./...` in `services/gateway` | Not run | `go` command missing. |
| `pnpm --filter @school-sis/web run infra:check -- --strict` | Fail locally | Required production secrets/env were not loaded in local shell. |

## P0 Launch Blockers

### 1. Access Control Is Not Yet A Single Enforced Model

Priority: P0 launch blocker  
Owner: Platform/auth  
Risk: Unauthorized cross-role access, inconsistent page/API behavior, and false confidence from middleware checks that do not match route-group output.

Evidence:

- `apps/web/src/middleware.ts:115-153` classifies routes by URL prefixes such as `/admin`, `/dashboard`, `/parent`, `/overview`, `/platform`, `/teacher`, and `/operator`.
- Next route groups do not emit their group name into URLs. Pages under `(admin)` emit paths like `/admissions`, `/fees`, `/settings/users`, not `/admin/...`.
- `apps/web/src/app/(admin)/layout.tsx` has a staff-level guard, which helps, but it is broad and not per-module RBAC.
- `apps/web/src/app/student/layout.tsx:16-19` explicitly comments out the non-student redirect and says the bypass is for demo purposes.
- `apps/web/src/app/(dashboard)/layout.tsx` uses NextAuth session while most app auth uses Iron Session.
- `apps/web/src/app/platform/layout.tsx` is client-side and relies on middleware for server-side protection.

Why it matters:

The product has multiple role surfaces: platform admin, school admin, teacher, parent, student, accountant, operator, admissions, and transport roles. A production SIS cannot rely on broad layout checks and path-prefix assumptions. Every route group, page family, and API mutation needs one policy matrix and tests.

Done criteria:

- Define a single route/page/API permission matrix covering all pages and API route handlers.
- Restore the student-only redirect in `apps/web/src/app/student/layout.tsx`.
- Remove the split between Iron Session and NextAuth or explicitly document and test the boundary.
- Add automated tests proving wrong-role users cannot access representative pages in every route group.
- Add route inventory tests that compare built routes against the permission matrix.
- Require page-level or layout-level server auth for every protected route group.

### 2. Dynamic Metadata Data API Lacks Object And Field Permission Enforcement

Priority: P0 launch blocker  
Owner: Platform/data engine  
Risk: Any authenticated tenant user can potentially read or create records for published custom objects inside the tenant.

Evidence:

- `apps/web/src/app/api/data/[object_name]/route.ts:26` uses `requireApiAuth()` with no role or permission list.
- `apps/web/src/app/api/data/[object_name]/route.ts:96` does the same for `POST`.
- The route validates tenant scope and strips tenant fields, which is good, but no object-level, field-level, or action-level permission check is enforced before reading or writing records.

Why it matters:

The metadata engine is a no-code data plane. If it is meant to power custom objects, it needs the same level of ACL maturity as first-party modules. Tenant isolation is necessary but not sufficient.

Done criteria:

- Add object-level permissions for read/create/update/delete.
- Add field-level read/write rules for sensitive fields.
- Make `GET` filter fields by field permission.
- Make `POST` reject writes to fields the actor cannot set.
- Add tests for parent, student, teacher, accountant, school admin, and platform admin access.
- Add audit logs for dynamic data reads and writes.

### 3. Mock, Demo, And Fixture Surfaces Still Exist In Runtime Code

Priority: P0 launch blocker  
Owner: Integrations/platform  
Risk: Production behavior can look successful while still being mock/demo behavior.

Evidence:

- `apps/web/src/lib/integrations/api-platform.ts:74-78` emits `X-School-SIS-Integration-Mode: mock`.
- `apps/web/src/lib/integrations/api-platform.ts:217-244` creates or updates integration connections with `mode = 'MOCK'`.
- `/api/mock` imports `@/lib/mock-data`; production blocks it unless `ENABLE_MOCK_API=true`, but it remains a production-build route.
- LTI launch is mock-token based.
- Integration retry logic marks webhook retries successful with mocked response data.
- Notification WhatsApp and push paths can generate mock provider message IDs.

Why it matters:

Schools, districts, and enterprise buyers will treat integrations as contractual commitments. Mock-mode integrations must be impossible to confuse with live interoperability.

Done criteria:

- Remove mock headers from production integration APIs.
- Make mock integrations dev/test-only or require an explicit non-production runtime.
- Replace LTI mock launch with real LTI 1.3/OIDC/JWKS validation before launch claims.
- Replace webhook retry mocks with real signed outbound delivery and retry evidence.
- Add production integration mode checks to CI and runtime readiness checks.
- Add negative tests proving production cannot enable mock data unintentionally.

### 4. Real Production Runtime Evidence Is Still Missing Locally

Priority: P0 launch blocker  
Owner: DevOps/platform  
Risk: Code can pass while production deployment lacks required secrets, providers, scheduler guarantees, or backup evidence.

Evidence:

- Strict local runtime check failed because production env was not loaded.
- Missing local strict evidence included database URLs, session secret, metrics/job secrets, encryption key, app URL, tenant hosts, payment secrets/webhooks, notification providers, cron secret, storage credentials, and backup retention.
- Warnings included non-minute scheduler, local `.vercel` presence, WhatsApp/push mock configuration, agent service not configured, missing backup restore evidence, Upstash missing, and Sentry DSN missing.

Why it matters:

Production readiness is not just code. Vercel, Neon, scheduler, storage, payment, notification, metrics, and backup settings must be validated against real production values.

Done criteria:

- Run strict infra check against real Vercel production environment variables.
- Capture evidence for Vercel env, Neon env, scheduler, storage, payment providers, notification providers, Sentry, Upstash, and backup retention.
- Record a backup/restore drill with timestamp, database, restore target, RPO/RTO, and verifier.
- Commit only evidence documents that do not expose secret values.
- Add CI or release gate that blocks production promotion without fresh runtime evidence.

### 5. Operational HTTP Endpoints Should Be Removed Or Made Local-Only

Priority: P0 launch blocker  
Owner: Platform/database  
Risk: Schema or seed operations over HTTP create avoidable operational and security risk.

Evidence:

- `apps/web/src/app/api/force-migrate/route.ts:16-26` is production-blocked and platform-admin gated, but the route still exists and contains hand-written `ALTER` statements.
- `apps/web/src/app/api/seed/route.ts:15-23` is production-gated, but the route still exists.
- `apps/web/src/app/api/seed/route.ts:58` falls back to `ScholarM!nd#2026$Secure` if `SEED_ADMIN_PASSWORD` is absent.
- `apps/web/src/app/api/seed/route.ts:61-73` seeds known email addresses and creates `SUPER_ADMIN` users.

Why it matters:

Operational database actions belong in migrations, release scripts, or controlled runbooks, not web routes. Even gated routes increase blast radius.

Done criteria:

- Delete `/api/force-migrate` after confirming all schema changes are represented by Drizzle migrations.
- Convert `/api/seed` to a local-only script or one-time controlled bootstrap runbook.
- Remove fallback seed credentials entirely.
- Add tests or CI scan preventing production route handlers named seed, force-migrate, debug, fixture, or backfill unless explicitly allowlisted.

## P1 Production Hardening

### 6. Content Security Policy Still Allows Unsafe Script Execution

Priority: P1  
Owner: Security/frontend platform  
Risk: Higher XSS blast radius.

Evidence:

- `apps/web/src/lib/security/headers.ts:27-39` defines CSP.
- `apps/web/src/lib/security/headers.ts:30` allows `script-src 'unsafe-inline' 'unsafe-eval'`.
- `apps/web/src/lib/security/headers.ts:31` allows `style-src 'unsafe-inline'`.

Done criteria:

- Move to nonce or hash based script policy.
- Remove `unsafe-eval` in production.
- Keep payment provider exceptions only where required and documented.
- Add CSP report-only rollout before enforcement.
- Add DAST or Playwright header checks in CI.

### 7. Mobile App Is Prototype-Grade, Not Production-Ready

Priority: P1  
Owner: Mobile/product  
Risk: Parent/student mobile workflows appear productized but do not have real auth or secure request context.

Evidence:

- `apps/mobile/screens/LoginScreen.tsx:12-19` disables mobile login and instructs users to use the web portal.
- `apps/mobile/screens/TuitionPaymentScreen.tsx:21-30` calls a parent payment endpoint without an auth header.
- Mobile TypeScript passes, but runtime auth and secure payment flow are not implemented.

Done criteria:

- Implement token-based mobile login and refresh.
- Store tokens securely in platform keychain/keystore.
- Attach auth and tenant context to all mobile API calls.
- Add mobile E2E tests for login, invoice view, notification view, and payment handoff.
- Hide or remove mobile production packaging until those flows pass.

### 8. Legacy Payment Backend Route Should Be Removed Or Reconciled

Priority: P1  
Owner: Payments  
Risk: Duplicate payment order flows and accidental dependency on a local or external Java backend.

Evidence:

- `apps/web/src/app/api/payments/create-order/route.ts:8` defaults `NEXT_PUBLIC_API_URL` to `http://localhost:8080`.
- `apps/web/src/app/api/payments/create-order/route.ts:24-32` forwards payment order creation to `/api/v1/payments/create-order` on that backend.
- The newer in-app payment order, verification, webhook, ledger, idempotency, invoice ownership, and row-locking paths are stronger and should be the canonical flow.

Done criteria:

- Identify all callers of `/api/payments/create-order`.
- Migrate callers to the canonical in-app payment order flow.
- Delete or hard-disable the legacy route.
- Add route-level tests proving parents can only pay their own invoices.
- Re-run payment webhook and ledger tests.

### 9. Go Gateway Is Not A Production Edge

Priority: P1  
Owner: Platform/infrastructure  
Risk: If exposed publicly, gateway permits wildcard CORS and lacks an explicit auth perimeter.

Evidence:

- `services/gateway/cmd/server/main.go:22-28` defaults services to localhost.
- `services/gateway/cmd/server/main.go:53-67` reverse-proxies agent, inference, and web traffic.
- `services/gateway/cmd/server/main.go:91-95` sets `Access-Control-Allow-Origin: *` and broad allowed methods/headers.
- `go test` could not run because Go was not installed locally.

Done criteria:

- Decide whether the gateway is needed for production.
- If not needed, remove it from production deployment docs and CI.
- If needed, add gateway auth, allowlisted origins, request size/time limits, upstream health checks, tests, and observability.
- Install Go in CI or remove gateway tests from production gates if the service is not shipped.

### 10. Legacy Storage Adapter Uses Unsigned Raw R2 Calls

Priority: P1  
Owner: Storage/platform  
Risk: Confusing duplicate storage implementation and likely non-functional direct R2 access.

Evidence:

- `packages/api/src/services/storage.ts:82-95` reads R2 credentials.
- `packages/api/src/services/storage.ts:117-125` uploads via raw `fetch` with `x-amz-content-sha256: UNSIGNED-PAYLOAD` and does not sign the request.
- The web app has stronger upload/download routes using AWS SDK and signed URLs.

Done criteria:

- Confirm whether `packages/api/src/services/storage.ts` is still imported in production paths.
- Delete it if unused.
- If still needed, replace raw fetch with the same signed S3/R2 SDK implementation used by web routes.
- Add integration tests against a mock S3-compatible server.

### 11. Notification And Job Delivery Need Provider Evidence

Priority: P1  
Owner: Communications/SRE  
Risk: Jobs can succeed in the system while user-facing messages are mock or provider-unverified.

Evidence:

- `apps/web/src/lib/notifications/outbox.ts:78-92` defaults provider names to `mock` unless configured.
- `apps/web/src/lib/notifications/outbox.ts:214-229` returns mock WhatsApp success.
- `apps/web/src/lib/notifications/outbox.ts:231-260` returns mock push success unless Firebase is configured.
- `apps/web/src/lib/worker/dispatcher.ts:39-78` has a solid DB job claim pattern using `FOR UPDATE SKIP LOCKED`.

Done criteria:

- Configure production email, SMS, WhatsApp, and push providers or disable unsupported channels.
- Add delivery receipt/webhook ingestion where providers support it.
- Add dashboards for queued, failed, dead-lettered, delivered, and suppressed messages.
- Add a real end-to-end message delivery drill and evidence.

### 12. RLS And Database Security Need Formal Coverage

Priority: P1  
Owner: Database/platform  
Risk: Strong tenant-context primitives exist, but policy coverage and bypass use need proof.

Evidence:

- Database context helpers set tenant and bypass state.
- Static schema scan found 145 tables and 128 tenant column occurrences.
- Tables without a `tenantId` occurrence include both legitimate platform/shared tables and tables that need review: `grade_subjects`, `companies`, `tenants`, `exam_schedules`, `fee_components`, `grading_rubrics`, `hq_groups`, `group_policies`, `metadata_fields`, `metadata_layouts`, `field_permissions`, `metadata_values`, `rate_limit_buckets`, `platform_audit_logs`, `platform_broadcasts`, `marketing_leads`, and `stops`.

Done criteria:

- Produce an RLS policy matrix for every table.
- Mark each table as tenant, platform, global reference, or join table.
- Add real Postgres regression tests for tenant isolation.
- Review every `runWithRlsBypass` call and require justification.
- Tighten production SSL verification with CA/verify-full where feasible.
- Add migration drift detection and destructive migration review gates.

### 13. Generated And Session Artifacts Are Still Tracked

Priority: P1  
Owner: Repository hygiene  
Risk: Noise, stale evidence, accidental leakage, and unstable diffs.

Evidence:

- `git ls-files` shows tracked `.agents/**` session/handoff files.
- `apps/web/tsconfig.tsbuildinfo` is tracked.
- `build.log` and `server.log` are tracked.
- Existing hygiene gates passed but did not catch these tracked artifacts.

Done criteria:

- Delete or archive tracked `.agents/**` content according to the generated-file lifecycle.
- Remove tracked `apps/web/tsconfig.tsbuildinfo`, `server.log`, and `build.log`.
- Add ignore rules for these artifact families.
- Extend `audit:hygiene` so tracked generated artifacts fail CI.
- Keep durable evidence only under intentional locations like `audits/reports/`.

### 14. AI Safety, Evaluation, And Cost Controls Need Launch Evidence

Priority: P1  
Owner: AI/platform  
Risk: Prompt injection, hallucination, tenant leakage, model outage, and uncontrolled spend.

Evidence:

- `apps/web/src/app/api/chat/route.ts` proxies to the agent service with tenant/user headers and service token.
- `apps/web/src/app/api/copilot/route.ts` builds a context-rich prompt using tenant data and metadata structures.
- `services/agents/src/core/security.py` includes useful security controls, but Redis rate limiting fails open when Redis is unavailable.
- No current evidence file proves prompt-injection tests, groundedness checks, tenant-leakage tests, model fallback, red-team coverage, or token/cost budgets.

Done criteria:

- Add AI eval suites for prompt injection, tenant leakage, hallucination, unsafe tool use, and grounding.
- Add per-tenant/per-user token and cost budgets.
- Add model fallback policy and incident response runbook.
- Add red-team tests for agent tools and retrieval boundaries.
- Capture eval evidence in release artifacts.

### 15. Rate Limiting Can Fail Open In Important Paths

Priority: P1  
Owner: Security/platform  
Risk: Public lead capture and AI service endpoints can lose throttling during dependency failure.

Evidence:

- Public `/api/leads` is rate limited by IP and email, which is good.
- Rate limit storage can use Upstash/Postgres/memory depending on environment.
- Production runtime check warned Upstash was not configured locally.
- Agent service Redis rate limiting returns early if Redis is unavailable.

Done criteria:

- Decide fail-open vs fail-closed behavior per endpoint class.
- Make unauthenticated public write endpoints fail closed or degrade to stricter local limits.
- Configure Upstash or equivalent in production.
- Add tests for rate-limit backend outage behavior.
- Add dashboards and alerts for throttled, allowed, and backend-failure states.

## P2 Quality, Maintainability, And Scale Gaps

### 16. Static Risk Debt Needs Reduction

Priority: P2  
Owner: Engineering  
Risk: Type looseness, raw SQL sprawl, logs, and demo markers increase regression risk.

Static scan observations:

| Signal | Count |
| --- | ---: |
| `console.error` | 116 |
| `console.log` | 26 |
| Browser `alert` usage | 31 |
| `dangerouslySetInnerHTML` | 0 |
| `.innerHTML` | 0 |
| `eval` | 0 |
| `new Function` | 0 |
| `localStorage` | 4 |
| `any` type usage | 257 |
| Raw SQL markers | 731 |
| TODO markers | 7 |
| mock/demo/seed markers | 144 |

Done criteria:

- Replace production `console.*` with structured logger where needed.
- Reduce `any` usage around auth, payments, tenant context, metadata, and API payloads.
- Centralize repeated raw SQL behind repositories/services for high-risk domains.
- Add CI scan thresholds that can only move downward.

### 17. Website Lead Capture Needs Production Anti-Spam And Env Evidence

Priority: P2  
Owner: Growth/platform  
Risk: Public form is operationally useful but needs production rate-limit, CRM, consent, and routing evidence.

Done criteria:

- Confirm `NEXT_PUBLIC_API_URL` points to production API in website production.
- Add spam/bot controls appropriate for lead capture.
- Add privacy/consent copy and retention policy.
- Add CRM or notification integration with retry and evidence.
- Add monitoring for failed lead capture.

### 18. Toolchain Drift Should Be Closed

Priority: P2  
Owner: Developer experience  
Risk: Local and CI behavior differ.

Evidence:

- Local pnpm warned that the `pnpm.overrides` field is ignored by the local pnpm version.
- GitHub appears to enforce the expected lockfile/override behavior on `main`.

Done criteria:

- Pin and enforce the exact pnpm version through `packageManager` and Corepack.
- Add a preflight script that fails on unsupported pnpm versions.
- Document local setup in the developer guide.

### 19. Next.js Build Warnings Should Be Resolved

Priority: P2  
Owner: Web platform  
Risk: Framework upgrade debt and unexpected caching behavior.

Evidence:

- Web build warned that the middleware file convention is deprecated and should migrate to the new proxy convention.
- Web build warned about custom `Cache-Control` headers for `_next/static`.

Done criteria:

- Migrate middleware/proxy convention per current Next.js guidance.
- Revisit static asset cache headers.
- Add build warning budget to CI.

### 20. Side-Service Test Tooling Is Incomplete

Priority: P2  
Owner: Platform services  
Risk: Services compile or exist but do not have verified test coverage in the current environment.

Evidence:

- Python agent tests could not run because `pytest` was missing.
- Go gateway tests could not run because `go` was missing.
- Rust inference compiled but had zero tests and unused-code warnings.

Done criteria:

- Add Python test dependencies and run them in CI.
- Add Go toolchain if gateway remains in scope.
- Add Rust unit/integration tests for auth, request validation, and inference fallback paths.
- Make side-service CI required only for services that are part of the production architecture.

## Domain And Module Readiness Matrix

| Domain/module | Current posture | Launch readiness |
| --- | --- | --- |
| Admissions | Pages and flows exist; new admission forms found. Needs module-level RBAC and import/UAT proof. | Pilot after RBAC tests. |
| Attendance | Core app surface exists. Needs page/API coverage, offline/mobile story, and tenant isolation tests. | Pilot with constraints. |
| Exams | Creation and scheduling surfaces exist. Needs role policy, approval/state lifecycle, and report verification. | Pilot with constraints. |
| Fees and payments | Stronger ledger, verification, webhook, idempotency, and invoice locking exist. Legacy payment route remains. | Close legacy route and real provider evidence first. |
| Timetable | Pages/forms exist. Needs conflict tests, approval workflow, and module RBAC. | Pilot after tests. |
| Transport | Schema/page surface exists. Needs route/stop tenant review and operational workflow tests. | Not launch-ready without workflow proof. |
| HR/staff | Staff data exists. Needs role matrix and privacy controls for HR fields. | Pilot after permissions review. |
| Library | Surface exists. Needs inventory/workflow and tenant tests. | Pilot with constraints. |
| Parent portal | Server layout role guard exists. Payment and notification flows need provider/mobile evidence. | Web pilot after payment/provider evidence. |
| Student portal | Role guard is disabled for non-students. | Not launch-ready. |
| AI/copilot/agents | Service auth and prompt controls exist. Eval, leakage, fallback, and budget evidence missing. | Not launch-ready for regulated customers. |
| BI/analytics | Surfaces exist. Needs permission model, query safety, and data freshness evidence. | Pilot with admin-only access. |
| Operator/SRE console | Route protection exists through middleware. Needs incident/runbook/UAT proof. | Internal only until evidence. |
| Integrations | API key auth and audit logs exist, but runtime mode is mock for several providers. | Not launch-ready. |
| Mobile app | TypeScript passes, but login is disabled. | Not production-ready. |
| Marketing website | Build and TypeScript pass. Lead capture needs env/spam/CRM evidence. | Launch-ready after ops evidence. |

## Data And Field Audit Themes

The schema is broad enough for a real SIS, but the production-readiness question is not whether fields exist; it is whether every field has the right ownership, validation, tenant boundary, audit history, and access policy.

Required field-level follow-up:

- Classify every table as tenant, platform, global reference, join table, event, audit, or generated.
- Classify every column containing PII, payment data, health data, credential data, AI prompt data, or operational secrets.
- Define read/write roles for sensitive fields.
- Add redaction rules for logs, AI prompts, exports, support views, and audit evidence.
- Add retention policy per data family: students, guardians, employees, payments, messages, documents, AI conversations, logs, imports, exports, and backups.
- Add export/delete/legal hold procedures for privacy requests.
- Add data migration validation for imported customer data.

## Page And Form Audit Themes

The web app has a large page surface. Static scan found 145 pages and 141 form controls. The highest-control pages included admissions, settings/users, login, exams/create, hostel, timetable/new, onboarding/register, parent payment, and tenant creation.

Required page-level follow-up:

- Build a page inventory file generated from Next route output.
- Assign each page to one owner module and one access policy.
- Add smoke tests for every Tier 1 workflow page.
- Add wrong-role tests for representative pages in every route group.
- Add accessibility checks for login, admissions, fees/payment, attendance, exams, parent portal, student portal, and admin settings.
- Remove hardcoded demo identity text from production pages.

## Repository Hygiene And File Lifecycle

Current generated-file lifecycle gaps:

| Artifact | Current issue | Required action |
| --- | --- | --- |
| `.agents/**` | Tracked session artifacts | Delete or archive outside source, then ignore. |
| `apps/web/tsconfig.tsbuildinfo` | Tracked build cache | Remove from Git and ignore. |
| `server.log` | Tracked local log | Remove from Git and ignore. |
| `build.log` | Tracked local log | Remove from Git and ignore. |
| `.codex/` | Ignored | Keep ignored. |
| `.npm-cache/` | Ignored | Keep ignored. |
| `.next/` | Ignored | Keep ignored. |
| Playwright reports/test results | Ignored/generated | Commit only intentional evidence summaries, not raw transient output. |
| Migration dry-run reports | Evidence when intentional | Store sanitized reports under `audits/reports/`. |
| Customer imports/exports | Sensitive | Never commit raw customer data. Store securely outside repo. |
| Audit JSON | Evidence when intentional | Commit only sanitized evidence with clear date/source. |
| Temporary scripts | Risky when stale | Delete after use or promote to maintained script with tests. |

## Production-Ready Closure Plan

### First 48 Hours

1. Fix access-control model:
   - Restore student role guard.
   - Produce route/page/API permission matrix.
   - Add wrong-role tests for route groups and Tier 1 APIs.

2. Remove operational HTTP endpoints:
   - Delete or hard-disable `/api/force-migrate`.
   - Convert `/api/seed` to local script and remove fallback password.

3. Lock dynamic metadata API:
   - Add object and field permission enforcement.
   - Add tests for read/write denial across roles.

4. Remove production mock ambiguity:
   - Make mock integration mode impossible in production.
   - Add CI/runtime check for `mock`, `demo`, and `fixture` route allowlist.

5. Capture real runtime evidence:
   - Re-run strict infra check with production Vercel/Neon env.
   - Record backup/restore drill evidence.

### Days 3-7

1. Tighten CSP and add header tests.
2. Remove legacy payment route or migrate callers.
3. Remove or replace legacy storage adapter.
4. Configure notification providers and delivery evidence.
5. Decide whether Go gateway ships; secure or remove it.
6. Extend repository hygiene gate for tracked generated artifacts.
7. Install and run Python/Go service test tooling where services remain in production scope.

### Weeks 2-4

1. Complete RLS policy matrix and real Postgres isolation tests.
2. Build AI eval suite, leakage tests, red-team tests, and cost budgets.
3. Add accessibility operating model and CI checks for Tier 1 flows.
4. Complete pilot/UAT governance and procurement evidence room.
5. Add domain eventing/replay coverage and module readiness gates.
6. Build customer-success, support, incident, release, and status-page operating routines.

## Files And Areas To Remove, Archive, Or Reconcile

Candidates after dependency check:

- `apps/web/src/app/api/force-migrate/route.ts`: delete after migration parity is confirmed.
- `apps/web/src/app/api/seed/route.ts`: convert to local script/runbook; remove HTTP route.
- `apps/web/src/app/api/payments/create-order/route.ts`: remove after migrating callers to canonical payment order flow.
- `packages/api/src/services/storage.ts`: delete or replace with signed SDK implementation.
- `.agents/**`: remove from Git and ignore.
- `apps/web/tsconfig.tsbuildinfo`: remove from Git and ignore.
- `build.log`: remove from Git and ignore.
- `server.log`: remove from Git and ignore.
- Any production route or UI path whose only behavior is mock/demo/fixture data.

## What Is Already Strong

- Main branch CI and E2E were green at the time of audit.
- Local web TypeScript, Jest, architecture tests, and build passed.
- Website and mobile TypeScript passed.
- Payment ledger patterns include idempotency, invoice ownership checks, webhooks, and row locking.
- API auth helpers exist for roles, permissions, service bearer tokens, and integration API keys.
- Tenant JSON helpers reject tenant field injection and strip tenant-owned fields.
- Storage upload/download routes use tenant-scoped keys and signed URLs.
- DB-backed background dispatcher uses `FOR UPDATE SKIP LOCKED`.
- Integration API key authentication hashes keys, checks scopes, checks expiry, and records audit logs.
- Security headers include HSTS, frame denial, no-sniff, referrer policy, and permissions policy.

## Final Readiness Assessment

The platform has crossed the "prototype only" line for large parts of the web application: core builds pass, many security primitives exist, payment architecture is much stronger than average early-stage SIS code, and production deployment mechanics are mostly organized.

It is not yet ready for a full production launch with real schools until the P0 blockers are closed. The fastest credible path is to close access control, mock/runtime ambiguity, operational HTTP endpoints, dynamic metadata permissions, and real Vercel/Neon/provider evidence first. After those are closed, the project can move into pilot-readiness hardening and then scale-readiness work.
