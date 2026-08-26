# School SIS — Issues & Roadmap

> **Document version**: 2.4.0
> **Last updated**: 2026-08-15
> **Source of truth**: [`audits/reports/2026-07-04-full-application-audit.md`](../audits/reports/2026-07-04-full-application-audit.md), re-verified against the live GitHub issue/PR state and the Vercel/Neon release-remediation branch on 2026-08-15.
> **Runtime**: Production runs on Vercel (`sin1`) with Neon Postgres; previews deploy to `iad1` on Neon branches. GitHub Actions owns preview and production release ordering. Local development is local-only — see [RUNNING.md](../RUNNING.md).
> **Supersedes**: v1.0.0 (2026-04-26) dependency/security audit — its still-open items are folded into the security, hygiene, and testing issues below.

This roadmap is the human-readable index over the live GitHub issues. Every item below links to a tracked issue with re-verified evidence and residual done-criteria. Issues are grouped into three milestones by launch priority.

## Executive summary

The platform has crossed the prototype line for most of the web app: core builds and CI are green, payment architecture (idempotency, invoice ownership, webhooks, row-locking) is strong, and the priority security sequence is complete. Access control is centralized, runtime mock/fixture ambiguity is removed, CSP is nonce-based and enforced by default in production, distributed rate limiting fails closed or stricter on outage, and the 144-table RLS policy surface is covered by a real non-superuser Postgres test.

It still runs entirely locally for development. Vercel and Neon are now the selected production targets, so production runtime evidence is an active P0 gate. Provider configuration, the one-time Neon baseline reconciliation, and a verified staged release must complete before #18 can close.

### Commercial pilot scope gate (effective 2026-08-21)

Until the first three paid design-partner pilots complete, active product expansion is limited to the production/security queue and the [`Group Finance Control Pilot`](./gtm/GROUP_FINANCE_CONTROL_PILOT.md): source-data import, fee-ledger normalization, reconciliation, receivables/exceptions, waiver/refund approvals, audit evidence, multi-campus executive reporting, native exports, demo safety, and implementation tooling. Mobile rollout, autonomous AI, higher-ed/coaching expansion, and unrelated horizontal modules are gated under [`PILOT_SCOPE_FREEZE.md`](./gtm/PILOT_SCOPE_FREEZE.md). Exceptions require linked customer or production evidence in the [`evidence and decision log`](./gtm/EVIDENCE_AND_DECISION_LOG.md).

| Milestone                                                                                                  | Focus                                            | Open items |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------: |
| [Phase 0 — Launch Blockers (P0)](https://github.com/singhaditya21/school-sis/milestone/1)                  | Must fix before any production launch            |   1 active |
| [Phase 1 — Production Hardening (P1)](https://github.com/singhaditya21/school-sis/milestone/2)             | Security/reliability/provider evidence at launch |          7 |
| [Phase 2 — Quality, Maintainability & Scale (P2)](https://github.com/singhaditya21/school-sis/milestone/3) | Debt reduction & scale readiness                 |          6 |

**Post-remediation live totals (2026-08-15)**: 14 open GitHub issues — 1 active P0, 7 P1, and 6 P2. Issues #16, #17, #19, #20, #22, #26, and #29 are closed. The nine stale/superseded pull requests were dispositioned through [`OPEN_PR_TRIAGE_2026-08-07.md`](./OPEN_PR_TRIAGE_2026-08-07.md).

**Status legend**: 🔴 Open · 🟡 In progress (partially addressed) · ⏸️ Formally deferred (criteria retained) · 🟢 Done (verified).

---

## Phase 0 — Launch blockers (P0) · [milestone](https://github.com/singhaditya21/school-sis/milestone/1)

These block production go-live. Target: close first.

| Issue                                                        | Title                                                                           | Status                                                           | Areas                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| [#17](https://github.com/singhaditya21/school-sis/issues/17) | Remove or hard-isolate mock/demo/fixture surfaces from runtime integration code | 🟢 Done                                                          | `integrations`, `security`, `notifications` |
| [#18](https://github.com/singhaditya21/school-sis/issues/18) | Capture strict production runtime evidence and add a strict infra release gate  | 🚨 Active P0 — Vercel/Neon selected; activation evidence pending | `infra`, `observability`, `database`        |

## Phase 1 — Production hardening (P1) · [milestone](https://github.com/singhaditya21/school-sis/milestone/2)

Required at or immediately around launch.

| Issue                                                        | Title                                                                                                                          | Status                                                                                                                                  | Areas                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [#20](https://github.com/singhaditya21/school-sis/issues/20) | Tighten Content-Security-Policy: remove script-src unsafe-inline/unsafe-eval                                                   | 🟢 Done                                                                                                                                 | `security`, `frontend`, `payments`               |
| [#21](https://github.com/singhaditya21/school-sis/issues/21) | Make the mobile app production-ready (real auth, secure payment context) or gate it                                            | 🟡 In progress — two mobile-build-only `image-size` advisories are narrowly excepted through 2026-09-15 while no patched release exists | `mobile`, `payments`, `security`                 |
| [#23](https://github.com/singhaditya21/school-sis/issues/23) | Decide the Go gateway: secure it as a real edge or remove it from production                                                   | 🟢 Done                                                                                                                                 | `services`, `security`, `rate-limiting`          |
| [#24](https://github.com/singhaditya21/school-sis/issues/24) | Remove the unused legacy R2 storage adapter that uploads via unsigned raw fetch                                                | 🔴 Open                                                                                                                                 | `storage`, `security`                            |
| [#25](https://github.com/singhaditya21/school-sis/issues/25) | Provide notification provider evidence or disable unsupported channels (WhatsApp/push mock; no delivery-receipt ingestion)     | 🟡 In progress                                                                                                                          | `notifications`, `integrations`, `observability` |
| [#26](https://github.com/singhaditya21/school-sis/issues/26) | Formalize RLS/database security: policy matrix, real Postgres isolation tests, bypass review, verify-full SSL, migration gates | 🟢 Done                                                                                                                                 | `database`, `security`, `testing`                |
| [#27](https://github.com/singhaditya21/school-sis/issues/27) | Stop tracking generated/session artifacts (.agents/\*_, _.tsbuildinfo, build.log, server.log)                                  | 🟢 Done                                                                                                                                 | `hygiene`, `devex`                               |
| [#28](https://github.com/singhaditya21/school-sis/issues/28) | Add AI eval suites, per-tenant token/cost budgets, model fallback, and red-team tests for agent/copilot                        | 🟡 In progress                                                                                                                          | `ai`, `testing`, `rate-limiting`                 |
| [#29](https://github.com/singhaditya21/school-sis/issues/29) | Make rate limiting fail closed (or degrade stricter) on backend outage for public/AI endpoints                                 | 🟢 Done                                                                                                                                 | `rate-limiting`, `security`, `services`          |
| [#42](https://github.com/singhaditya21/school-sis/issues/42) | Reimplement PDF generation and user/role management natively after Java backend removal                                        | 🔴 Open                                                                                                                                 | `payments`, `identity`, `security`               |

## Phase 2 — Quality, maintainability & scale (P2) · [milestone](https://github.com/singhaditya21/school-sis/milestone/3)

Debt reduction and scale-readiness; parallelizable with pilot operations.

| Issue                                                        | Title                                                                                       | Status         | Areas                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------ |
| [#30](https://github.com/singhaditya21/school-sis/issues/30) | Reduce static risk debt (console.\*, any, raw SQL, alerts) with downward-only CI thresholds | 🟡 In progress | `hygiene`, `observability`, `devex`        |
| [#31](https://github.com/singhaditya21/school-sis/issues/31) | Harden website lead capture: production API env, anti-bot controls, consent, CRM routing    | 🟡 In progress | `website`, `integrations`, `observability` |
| [#32](https://github.com/singhaditya21/school-sis/issues/32) | Enforce pnpm toolchain via Corepack and a preflight guard; document in dev guide            | 🟡 In progress | `devex`, `infra`, `hygiene`                |
| [#33](https://github.com/singhaditya21/school-sis/issues/33) | Migrate middleware to proxy convention and revisit static cache headers for Next.js 16      | 🔴 Open        | `infra`, `devex`                           |
| [#34](https://github.com/singhaditya21/school-sis/issues/34) | Complete side-service test tooling and CI for Python/Go/Rust services                       | 🟢 Done | `testing`, `services`, `devex`             |
| [#37](https://github.com/singhaditya21/school-sis/issues/37) | Stabilize the full Playwright E2E suite and restore reliable scheduled coverage             | 🔴 Open        | `testing`, `quality`, `ci`                 |

---

## Security remediation completed (2026-08-07)

- **#17 — runtime mock isolation**: deleted the mock API and shared mock-data runtime, made live integrations the production default, rejected mock mode in production, removed fabricated success states, added signed webhook handling, and established a verified server-side LTI session without trusting launch query parameters.
- **#20 — enforced nonce CSP**: production now enforces a per-request nonce policy by default, removes `unsafe-inline`/`unsafe-eval` from script execution, serves Sonner styling statically, bounds and normalizes CSP reports, and covers hydration plus violation-free navigation in Playwright.
- **#29 — strict distributed rate limiting**: memory, Redis Lua, and Postgres implementations are atomic; production requires an explicit shared backend and degrades to a stricter bounded fallback. Readiness, metrics, alerts, a dashboard, and an outage runbook cover the remaining web/API entrypoints. The retired Python agent service has no live ingress.
- **#26 — formal database isolation**: all 144 documented tenant-bearing tables are covered by policy review and a real non-superuser Postgres test. The query wrapper applies pooler-safe transaction-local context, rejects unsafe transaction/context patterns, audits bypasses, defaults remote TLS to `verify-full`, and gates destructive migrations.
- **#18 — explicit decision**: Vercel/Neon and GitHub Actions are selected. The issue is active P0 until account configuration, legacy-ledger reconciliation, snapshot evidence, and an authenticated production readiness proof are complete.
- **Open PR triage**: useful encryption coverage and current GitHub Actions upgrades were consolidated into the remediation branch; stale/non-mergeable and failed dependency mega-groups are retired only after the replacement PR passes current CI.

## Earlier progress (2026-07-18)

Static risk-debt hardening (issue #30) is substantially underway:

- **Downward-only ratchet in CI** — `scripts/check-risk-debt.mjs` + `scripts/risk-debt-baseline.json`, wired as `pnpm audit:debt` inside `audit:ci` and enforced in the CI `validate` job. It fails the build if explicit `any`, `console.log/debug`, or native `alert/confirm/prompt` counts rise above the committed baseline. Commit `6cfb929b`.
- **`alert()` eliminated** — all 31 browser `alert()` calls converted to `sonner` toasts (`<Toaster/>` mounted once in the root layout); the 2 remaining native dialogs are `confirm()` delete-guards, grandfathered at baseline. Commit `eebbeeea`.
- **Explicit `any` cut 366 → 45** — type-only tightening across 97 files (DB-row interfaces, `unknown` + narrowing, correct library types); `tsc` clean, 131/131 tests pass. Baseline lowered to 45. Commit `80ee2dc4`.
- **Residual for #30**: burn the 45 remaining `any` down further, reduce `console.*` toward the structured logger, and add the raw-SQL lens.

Adjacent hygiene also landed: 13 unused dependencies removed and the pnpm store/lockfile realigned (`f2483d4b`, aids #32); `settings/users` and the last phantom-backend client replaced with native tenant-scoped server actions (`b99ea974`).

## Resolved by removal (verified against HEAD, 2026-08-26)

Three items were closed by deleting the code they described, not by fixing it. Verified against the current tree, not the GitHub issue list:

| Issue | Resolution | Evidence |
|---|---|---|
| [#23](https://github.com/singhaditya21/school-sis/issues/23) — Go gateway | 🟢 Resolved by removal | `services/gateway` deleted in `88793cdf`; no `services/` tree exists. |
| [#27](https://github.com/singhaditya21/school-sis/issues/27) — Tracked generated artifacts | 🟢 Resolved | `git ls-files` matches zero `.agents/**`, `*.tsbuildinfo`, `build.log`, `server.log`; `.gitignore` covers all four. |
| [#34](https://github.com/singhaditya21/school-sis/issues/34) — Python/Go/Rust service test tooling | 🟢 Resolved by removal | All three service trees deleted (`88793cdf`, `e2791939`). The repo is TypeScript-only. |

> When bumping this document, re-verify each item against `HEAD` rather than against the issue tracker alone — these three sat open for a month after the code was deleted.

## Verified done since the audit

| Audit finding                                                                                            | Outcome   | Evidence                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 #1 — Single enforced access-control model                                                             | 🟢 Done   | Centralized `lib/auth/page-access.ts` + `lib/auth/api-access.ts`; middleware classifies by real emitted URLs; student guard restored in `app/student/layout.tsx`; NextAuth removed (unified on Iron Session); route-inventory + wrong-role test suites (`__tests__/page-access-policy.test.ts`, `api-access-policy.test.ts`). Commits `5880d317`, `96b4553f`. |
| [#16](https://github.com/singhaditya21/school-sis/issues/16) — Dynamic metadata API audit logging        | 🟢 Closed | GitHub issue closed as completed on 2026-07-17.                                                                                                                                                                                                                                                                                                               |
| [#19](https://github.com/singhaditya21/school-sis/issues/19) — Operational migration/seed HTTP endpoints | 🟢 Closed | GitHub issue closed as completed on 2026-07-17.                                                                                                                                                                                                                                                                                                               |
| [#22](https://github.com/singhaditya21/school-sis/issues/22) — Legacy payment create-order proxy         | 🟢 Closed | GitHub issue closed as completed on 2026-07-18; remaining native PDF/user-role work is tracked in #42.                                                                                                                                                                                                                                                        |
| [#17](https://github.com/singhaditya21/school-sis/issues/17) — Runtime mock/demo/fixture isolation       | 🟢 Done   | Production guard + startup audit; live providers fail loudly; LTI OIDC/JWKS/session and signed webhook tests; no runtime mock endpoint or shared fixture module.                                                                                                                                                                                              |
| [#20](https://github.com/singhaditya21/school-sis/issues/20) — Strict Content-Security-Policy            | 🟢 Done   | Per-request nonces, production enforcement by default, bounded report ingestion, static Sonner CSS, response/unit coverage, and a browser hydration/CSP smoke test.                                                                                                                                                                                           |
| [#29](https://github.com/singhaditya21/school-sis/issues/29) — Strict rate-limit outage behavior         | 🟢 Done   | Atomic shared backends, explicit production backend selection, bounded strict fallback, entrypoint tests, readiness/metrics, Prometheus alerts, Grafana dashboard, and runbook.                                                                                                                                                                               |
| [#26](https://github.com/singhaditya21/school-sis/issues/26) — Formal RLS/database security              | 🟢 Done   | 144-table matrix; non-superuser Postgres isolation test; transaction-local context; bypass registry; remote `verify-full` TLS default; destructive-migration gates.                                                                                                                                                                                           |

_Minor residual hygiene from #1 (delete dead `app/(platform)/layout.tsx` and the empty `app/api/auth/[...nextauth]` dir) is folded into the repository-hygiene issue._

---

## Phased execution plan

Adapted from the audit's closure plan and updated after completion of the priority security sequence.

### Completed decision gate and security sequence

1. Runtime mock ambiguity removed — issue #17.
2. Finish the Vercel/Neon activation and capture strict production runtime evidence — issue #18.
3. Nine legacy pull requests triaged; useful work consolidated and retirement gated on current replacement CI.
4. Nonce-based production CSP completed — issue #20.
5. Strict distributed rate-limit outage behavior completed — issue #29.
6. Formal RLS/database isolation, SSL verification, bypass inventory, and migration gates completed — issue #26.

### Next priority queue (Phase 1)

1. Remove/replace the legacy R2 storage adapter — issue #24.
2. Decide the Go gateway: secure or remove — issue #23.
3. Produce notification delivery/provider evidence or disable unsupported channels — issue #25.
4. Reimplement native PDF and user/role management — issue #42.
5. Add AI eval suites, tenant leakage tests, model fallback, and cost budgets — issue #28.
6. Complete mobile production auth + secure payment context, or gate the client — issue #21.

### Subsequent quality and scale work

1. Restore reliable full-suite Playwright coverage — issue #37.
2. Static risk-debt reduction — issue #30; lead-capture hardening — issue #31; toolchain pinning — issue #32; Next.js proxy migration — issue #33; side-service test tooling — issue #34; repository hygiene — issue #27.

---

## Domain & module readiness (from audit)

| Domain/module                                              | Launch readiness                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Fees & payments                                            | Strong ledger/verification/webhook/idempotency; legacy route #22 is closed. Production-provider evidence is part of active issue #18. |
| Admissions / Attendance / Exams / Timetable / Library / HR | Database tenant isolation is verified; pilot after module RBAC and end-to-end workflow tests.                                         |
| Transport                                                  | Database tenant isolation is verified; pilot after route/stop authorization review and workflow tests.                                |
| Parent portal                                              | Web pilot after payment-provider UAT; mobile remains gated by #21.                                                                    |
| Student portal                                             | Access guard restored (done); pilot after portal workflow coverage.                                                                   |
| AI / copilot / agents                                      | Not launch-ready for regulated customers until eval/leakage/fallback/budget evidence (#28).                                           |
| Integrations                                               | Runtime mocks are removed; pilot requires configured provider credentials, delivery evidence (#25), and integration-specific UAT.     |
| Mobile app                                                 | Not production-ready until real auth + secure payments (#21).                                                                         |
| Operator/SRE console                                       | Internal-only until incident/runbook/UAT evidence.                                                                                    |
| Marketing website                                          | Launch-ready after lead-capture ops evidence (#31).                                                                                   |

---

## How to work this roadmap

- Filter by milestone: [Phase 0](https://github.com/singhaditya21/school-sis/milestone/1) · [Phase 1](https://github.com/singhaditya21/school-sis/milestone/2) · [Phase 2](https://github.com/singhaditya21/school-sis/milestone/3).
- Filter by priority label: [`P0`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP0) · [`P1`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP1) · [`P2`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP2).
- Each issue lists only **residual** done-criteria (already-completed work is excluded) and re-verified `file:line` evidence.
