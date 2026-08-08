# School SIS — Issues & Roadmap

> **Document version**: 2.4.2
> **Last updated**: 2026-08-08
> **Source of truth**: [`audits/reports/2026-07-04-full-application-audit.md`](../audits/reports/2026-07-04-full-application-audit.md), re-verified against the live GitHub issue/PR state and `main` on 2026-08-08.
> **Runtime**: Local-first — the app runs on localhost with a local Postgres cluster (`scripts/local-db.sh`); no cloud target.
> **Supersedes**: v1.0.0 (2026-04-26) dependency/security audit — its still-open items are folded into the security, hygiene, and testing issues below.

This roadmap is the human-readable index over the live GitHub issues. Every item below links to a tracked issue with re-verified evidence and residual done-criteria. Issues are grouped into three milestones by launch priority.

## Executive summary

The platform has crossed the prototype line for most of the web app: core build and CI coverage are established, payment architecture (idempotency, invoice ownership, webhooks, row-locking) is strong, and the priority security sequence is complete. Access control is centralized, runtime mock/fixture ambiguity is removed, CSP is nonce-based and enforced by default in production, distributed rate limiting fails closed or stricter on outage, and the 145-table RLS policy surface is covered by a real non-superuser Postgres test.

It runs entirely locally now (no cloud target). Production runtime evidence remains open but is formally deferred until a hosting/database/provider target and owner are selected; none of its launch criteria are waived. The stale gateway and unsigned storage surfaces are retired, native PDFs and tenant user management replace the removed Java backend, AI ingress now has enforced budgets/evals/fallback controls, and the unauthenticated mobile preview cannot be packaged for production. The only remaining Phase 1 acceptance item is a real, credentialed notification delivery drill (#25).

| Milestone | Focus | Open items |
|---|---|---:|
| [Phase 0 — Launch Blockers (P0)](https://github.com/singhaditya21/school-sis/milestone/1) | Must fix before any production launch | 1 (formally deferred) |
| [Phase 1 — Production Hardening (P1)](https://github.com/singhaditya21/school-sis/milestone/2) | Security/reliability/provider evidence at launch | 1 |
| [Phase 2 — Quality, Maintainability & Scale (P2)](https://github.com/singhaditya21/school-sis/milestone/3) | Debt reduction & scale readiness | 6 |

**Post-remediation live totals (after the current branch merges)**: 8 open GitHub issues — 1 deferred P0, 1 P1 awaiting live provider evidence, and 6 P2. Issues #16, #17, #19, #20, #21, #22, #23, #24, #26, #27, #28, #29, and #42 are completed. The nine stale/superseded pull requests were dispositioned through [`OPEN_PR_TRIAGE_2026-08-07.md`](./OPEN_PR_TRIAGE_2026-08-07.md).

**Status legend**: 🔴 Open · 🟡 In progress (partially addressed) · ⏸️ Formally deferred (criteria retained) · 🟢 Done (verified).

---

## Phase 0 — Launch blockers (P0) · [milestone](https://github.com/singhaditya21/school-sis/milestone/1)

These block production go-live. Target: close first.

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#17](https://github.com/singhaditya21/school-sis/issues/17) | Remove or hard-isolate mock/demo/fixture surfaces from runtime integration code | 🟢 Done | `integrations`, `security`, `notifications` |
| [#18](https://github.com/singhaditya21/school-sis/issues/18) | Capture strict production runtime evidence and add a strict infra release gate | ⏸️ Formally deferred until a production target is selected | `infra`, `observability`, `database` |

## Phase 1 — Production hardening (P1) · [milestone](https://github.com/singhaditya21/school-sis/milestone/2)

Required at or immediately around launch.

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#20](https://github.com/singhaditya21/school-sis/issues/20) | Tighten Content-Security-Policy: remove script-src unsafe-inline/unsafe-eval | 🟢 Done | `security`, `frontend`, `payments` |
| [#21](https://github.com/singhaditya21/school-sis/issues/21) | Make the mobile app production-ready (real auth, secure payment context) or gate it | 🟢 Done via fail-closed production gate | `mobile`, `payments`, `security` |
| [#23](https://github.com/singhaditya21/school-sis/issues/23) | Decide the Go gateway: secure it as a real edge or remove it from production | 🟢 Done — removed | `services`, `security`, `rate-limiting` |
| [#24](https://github.com/singhaditya21/school-sis/issues/24) | Remove the unused legacy R2 storage adapter that uploads via unsigned raw fetch | 🟢 Done — removed and regression-tested | `storage`, `security` |
| [#25](https://github.com/singhaditya21/school-sis/issues/25) | Provide notification provider evidence or disable unsupported channels (WhatsApp/push mock; no delivery-receipt ingestion) | 🟡 Code complete; live credentialed drill pending | `notifications`, `integrations`, `observability` |
| [#26](https://github.com/singhaditya21/school-sis/issues/26) | Formalize RLS/database security: policy matrix, real Postgres isolation tests, bypass review, verify-full SSL, migration gates | 🟢 Done | `database`, `security`, `testing` |
| [#27](https://github.com/singhaditya21/school-sis/issues/27) | Stop tracking generated/session artifacts (.agents/**, *.tsbuildinfo, build.log, server.log) | 🟢 Done — enforced in CI | `hygiene`, `devex` |
| [#28](https://github.com/singhaditya21/school-sis/issues/28) | Add AI eval suites, per-tenant token/cost budgets, model fallback, and red-team tests for agent/copilot | 🟢 Done | `ai`, `testing`, `rate-limiting` |
| [#29](https://github.com/singhaditya21/school-sis/issues/29) | Make rate limiting fail closed (or degrade stricter) on backend outage for public/AI endpoints | 🟢 Done | `rate-limiting`, `security`, `services` |
| [#42](https://github.com/singhaditya21/school-sis/issues/42) | Reimplement PDF generation and user/role management natively after Java backend removal | 🟢 Done | `payments`, `identity`, `security` |

## Phase 2 — Quality, maintainability & scale (P2) · [milestone](https://github.com/singhaditya21/school-sis/milestone/3)

Debt reduction and scale-readiness; parallelizable with pilot operations.

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#30](https://github.com/singhaditya21/school-sis/issues/30) | Reduce static risk debt (console.*, any, raw SQL, alerts) with downward-only CI thresholds | 🟡 In progress | `hygiene`, `observability`, `devex` |
| [#31](https://github.com/singhaditya21/school-sis/issues/31) | Harden website lead capture: production API env, anti-bot controls, consent, CRM routing | 🟡 In progress | `website`, `integrations`, `observability` |
| [#32](https://github.com/singhaditya21/school-sis/issues/32) | Enforce pnpm toolchain via Corepack and a preflight guard; document in dev guide | 🟡 In progress | `devex`, `infra`, `hygiene` |
| [#33](https://github.com/singhaditya21/school-sis/issues/33) | Migrate middleware to proxy convention and revisit static cache headers for Next.js 16 | 🔴 Open | `infra`, `devex` |
| [#34](https://github.com/singhaditya21/school-sis/issues/34) | Complete side-service test tooling and CI for Python/Go/Rust services | 🟡 In progress | `testing`, `services`, `devex` |
| [#37](https://github.com/singhaditya21/school-sis/issues/37) | Stabilize the full Playwright E2E suite and restore reliable scheduled coverage | 🔴 Open | `testing`, `quality`, `ci` |

---

## Security remediation completed (re-verified 2026-08-08)

- **#17 — runtime mock isolation**: deleted the mock API and shared mock-data runtime, made live integrations the production default, rejected mock mode in production, removed fabricated success states, added signed webhook handling, and established a verified server-side LTI session without trusting launch query parameters.
- **#20 — enforced nonce CSP**: production now enforces a per-request nonce policy by default, removes `unsafe-inline`/`unsafe-eval` from script execution, serves Sonner styling statically, bounds and normalizes CSP reports, and covers hydration plus violation-free navigation in Playwright.
- **#29 — strict distributed rate limiting**: memory, Redis Lua, and Postgres implementations are atomic; production requires an explicit shared backend and degrades to a stricter bounded fallback. Readiness, metrics, alerts, a dashboard, and an outage runbook cover the remaining web/API entrypoints. The retired Python agent service has no live ingress.
- **#26 — formal database isolation**: all 145 documented tables are covered by policy review and a real non-superuser Postgres test. The query wrapper applies pooler-safe transaction-local context, rejects unsafe transaction/context patterns, audits bypasses, defaults remote TLS to `verify-full`, and gates destructive migrations.
- **#21 — mobile production gate**: the auth-disabled Expo client is explicitly an internal preview; payment/notification routes are absent, production/store/unknown profiles fail closed, and CI tests the gate. This is the issue's gating outcome, not a claim that mobile auth is production-ready.
- **#23/#24/#27 — retired and guarded surfaces**: the unwired Go gateway and unsigned legacy storage adapter are absent, current architecture names `apps/web` as the security boundary, and CI rejects tracked `.agents/**`, logs, and TypeScript build artifacts.
- **#28 — AI governance**: native copilot ingress uses strict outage rate limiting, prompt assessment, tenant-grounded read-only tools, atomic tenant/user token and cost budgets, and retryable-only pre-stream fallback. External agent ingress is fail-closed unless a versioned release manifest proves the required prompt-injection, tenant-leakage, groundedness, unsafe-tool, and retrieval eval categories and explicitly approves the requested agent. CI runs red-team/eval cases and retains their JSON artifact; the RLS matrix now covers 145 tables including `ai_budget_usage`.
- **#42 — native platform paths**: receipts and report cards render locally from tenant-scoped data with ownership/class boundaries and pagination. Tenant user management is native and privilege-ordered; human-initiated native-admin role changes use the existing two-person approval workflow and atomically consume each approval exactly once with the role mutation, while SCIM remains a separate authenticated provisioning boundary.
- **#25 — code remediation complete, operational acceptance open**: unsupported channels fail closed, Twilio WhatsApp/Firebase push are real adapters, atomic dispatch claims prevent duplicate sends, ambiguous provider outcomes require reconciliation instead of automatic retry, and authenticated receipts update delivery state monotonically. Operator/Prometheus views include delivered/suppressed by channel. No live provider delivery is claimed; the credential-gated drill remains open.
- **#18 — explicit decision**: production runtime evidence remains open and formally deferred, with all acceptance criteria retained. It automatically returns to active P0 when a production host, database, providers, and accountable owner are selected.
- **Open PR triage**: useful encryption coverage and current GitHub Actions upgrades were consolidated into the remediation branch; stale/non-mergeable and failed dependency mega-groups are retired only after the replacement PR passes current CI.

## Earlier progress (2026-07-18)

Static risk-debt hardening (issue #30) is substantially underway:

- **Downward-only ratchet in CI** — `scripts/check-risk-debt.mjs` + `scripts/risk-debt-baseline.json`, wired as `pnpm audit:debt` inside `audit:ci` and enforced in the CI `validate` job. It fails the build if explicit `any`, `console.log/debug`, or native `alert/confirm/prompt` counts rise above the committed baseline. Commit `6cfb929b`.
- **`alert()` eliminated** — all 31 browser `alert()` calls converted to `sonner` toasts (`<Toaster/>` mounted once in the root layout); the 2 remaining native dialogs are `confirm()` delete-guards, grandfathered at baseline. Commit `eebbeeea`.
- **Explicit `any` cut 366 → 45** — type-only tightening across 97 files (DB-row interfaces, `unknown` + narrowing, correct library types); `tsc` clean, 131/131 tests pass. Baseline lowered to 45. Commit `80ee2dc4`.
- **Residual for #30**: burn the 45 remaining `any` down further, reduce `console.*` toward the structured logger, and add the raw-SQL lens.

Adjacent hygiene also landed: 13 unused dependencies removed and the pnpm store/lockfile realigned (`f2483d4b`, aids #32); `settings/users` and the last phantom-backend client replaced with native tenant-scoped server actions (`b99ea974`).

## Verified done since the audit

| Audit finding | Outcome | Evidence |
|---|---|---|
| P0 #1 — Single enforced access-control model | 🟢 Done | Centralized `lib/auth/page-access.ts` + `lib/auth/api-access.ts`; middleware classifies by real emitted URLs; student guard restored in `app/student/layout.tsx`; NextAuth removed (unified on Iron Session); route-inventory + wrong-role test suites (`__tests__/page-access-policy.test.ts`, `api-access-policy.test.ts`). Commits `5880d317`, `96b4553f`. |
| [#16](https://github.com/singhaditya21/school-sis/issues/16) — Dynamic metadata API audit logging | 🟢 Closed | GitHub issue closed as completed on 2026-07-17. |
| [#19](https://github.com/singhaditya21/school-sis/issues/19) — Operational migration/seed HTTP endpoints | 🟢 Closed | GitHub issue closed as completed on 2026-07-17. |
| [#22](https://github.com/singhaditya21/school-sis/issues/22) — Legacy payment create-order proxy | 🟢 Closed | GitHub issue closed as completed on 2026-07-18; remaining native PDF/user-role work is tracked in #42. |
| [#17](https://github.com/singhaditya21/school-sis/issues/17) — Runtime mock/demo/fixture isolation | 🟢 Done | Production guard + startup audit; live providers fail loudly; LTI OIDC/JWKS/session and signed webhook tests; no runtime mock endpoint or shared fixture module. |
| [#20](https://github.com/singhaditya21/school-sis/issues/20) — Strict Content-Security-Policy | 🟢 Done | Per-request nonces, production enforcement by default, bounded report ingestion, static Sonner CSS, response/unit coverage, and a browser hydration/CSP smoke test. |
| [#21](https://github.com/singhaditya21/school-sis/issues/21) — Mobile production readiness or gate | 🟢 Done via gate | Auth-disabled preview is labeled, sensitive screens are not navigable, and production/store packaging fails closed under CI-tested release profiles. |
| [#23](https://github.com/singhaditya21/school-sis/issues/23) — Go gateway decision | 🟢 Done | Unwired gateway source is absent; current architecture documents direct HTTPS to `apps/web` and the controls required before any future edge is introduced. |
| [#24](https://github.com/singhaditya21/school-sis/issues/24) — Unsigned legacy storage adapter | 🟢 Done | Adapter is absent; the live upload boundary uses the signed AWS SDK path with tenant-key coverage. |
| [#29](https://github.com/singhaditya21/school-sis/issues/29) — Strict rate-limit outage behavior | 🟢 Done | Atomic shared backends, explicit production backend selection, bounded strict fallback, entrypoint tests, readiness/metrics, Prometheus alerts, Grafana dashboard, and runbook. |
| [#26](https://github.com/singhaditya21/school-sis/issues/26) — Formal RLS/database security | 🟢 Done | 145-table matrix; non-superuser Postgres isolation test; transaction-local context; bypass registry; remote `verify-full` TLS default; destructive-migration gates. |
| [#27](https://github.com/singhaditya21/school-sis/issues/27) — Generated/session artifacts | 🟢 Done | No blocked artifacts are tracked; ignore rules plus a tested CI hygiene gate reject nested `.agents`, logs, and `.tsbuildinfo`. |
| [#28](https://github.com/singhaditya21/school-sis/issues/28) — AI safety, budgets, fallback, and evals | 🟢 Done | Tenant/user token and cost ceilings, prompt/tool grounding, retryable-only fallback, stricter rate-limit degradation, RLS, red-team tests, runbook, and CI eval artifact. |
| [#42](https://github.com/singhaditya21/school-sis/issues/42) — Native PDF and user/role management | 🟢 Done | Native tenant/ownership-scoped receipt and paginated report-card PDFs; native tenant user actions; approval-backed, anti-escalation role changes with transactional one-time approval consumption. |

The dead platform layout is absent and the empty retired NextAuth directory has been removed locally; the remaining `/api/auth/token` route is the live token surface.

---

## Phased execution plan

Adapted from the audit's closure plan and updated after completion of the priority security sequence.

### Completed decision gate and security sequence

1. Runtime mock ambiguity removed — issue #17.
2. Production runtime evidence formally deferred without waiving criteria — issue #18. Reactivate it as P0 immediately when a production hosting/database/provider target is selected.
3. Nine legacy pull requests triaged; useful work consolidated and retirement gated on current replacement CI.
4. Nonce-based production CSP completed — issue #20.
5. Strict distributed rate-limit outage behavior completed — issue #29.
6. Formal RLS/database isolation, SSL verification, bypass inventory, and migration gates completed — issue #26.
7. Unsigned legacy storage and stale gateway surfaces removed; repository hygiene enforced — issues #24, #23, and #27.
8. Native PDF and tenant user/role management completed — issue #42.
9. AI budgets, grounded tools, fallback policy, red-team evals, and CI artifact completed — issue #28.
10. Mobile distribution and sensitive routes formally gated until real mobile authentication exists — issue #21.

### Remaining Phase 1 operational acceptance

1. Select the enabled notification channels, approved recipients, and provider credentials; run the credential-gated delivery drill and attach provider-confirmed `DELIVERED` evidence — issue #25. This acceptance item remains active and can be completed independently of the deferred production-infrastructure work in #18.

### Subsequent quality and scale work

1. Restore reliable full-suite Playwright coverage — issue #37.
2. Static risk-debt reduction — issue #30; lead-capture hardening — issue #31; toolchain pinning — issue #32; Next.js proxy migration — issue #33; side-service test tooling — issue #34.

---

## Domain & module readiness (from audit)

| Domain/module | Launch readiness |
|---|---|
| Fees & payments | Strong ledger/verification/webhook/idempotency; legacy route #22 is closed. Production-provider evidence becomes part of reactivated #18 when a target is selected. |
| Admissions / Attendance / Exams / Timetable / Library / HR | Database tenant isolation is verified; pilot after module RBAC and end-to-end workflow tests. |
| Transport | Database tenant isolation is verified; pilot after route/stop authorization review and workflow tests. |
| Parent portal | Web pilot after payment-provider UAT; mobile distribution remains gated by the fail-closed control delivered in #21. |
| Student portal | Access guard restored (done); pilot after portal workflow coverage. |
| AI / copilot / agents | Code-side governance is enforced: budgets, grounded tools, fallback, rate-limit degradation, RLS, and CI eval evidence. Real provider/failure drills join production evidence in #18. |
| Integrations | Runtime mocks and synthetic delivery are removed; pilot requires configured provider credentials, the live notification drill (#25), and integration-specific UAT. |
| Mobile app | Formally blocked from production/store packaging. Reopening distribution requires token login/refresh, secure storage, tenant-scoped calls, and mobile E2E evidence. |
| Operator/SRE console | Internal-only until incident/runbook/UAT evidence. |
| Marketing website | Launch-ready after lead-capture ops evidence (#31). |

---

## How to work this roadmap

- Filter by milestone: [Phase 0](https://github.com/singhaditya21/school-sis/milestone/1) · [Phase 1](https://github.com/singhaditya21/school-sis/milestone/2) · [Phase 2](https://github.com/singhaditya21/school-sis/milestone/3).
- Filter by priority label: [`P0`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP0) · [`P1`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP1) · [`P2`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP2).
- Each issue lists only **residual** done-criteria (already-completed work is excluded) and re-verified `file:line` evidence.
