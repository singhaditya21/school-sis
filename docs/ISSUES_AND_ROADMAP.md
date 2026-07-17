# School SIS — Issues & Roadmap

> **Document version**: 2.0.0
> **Last updated**: 2026-07-17
> **Source of truth**: [`audits/reports/2026-07-04-full-application-audit.md`](../audits/reports/2026-07-04-full-application-audit.md), re-verified against the current `main` on 2026-07-17.
> **Hosting**: App on **Vercel**, database on **Neon**.
> **Supersedes**: v1.0.0 (2026-04-26) dependency/security audit — its still-open items are folded into the security, hygiene, and testing issues below.

This roadmap is the human-readable index over the live GitHub issues. Every item below links to a tracked issue with re-verified evidence and residual done-criteria. Issues are grouped into three milestones by launch priority.

## Executive summary

The platform has crossed the prototype line for most of the web app: core builds and CI are green, payment architecture (idempotency, invoice ownership, webhooks, row-locking) is strong, and many security primitives exist. **Access control (audit P0 #1) is now closed** — a single centralized page/API permission matrix, real-URL middleware, restored student guard, NextAuth removal, and route-inventory/wrong-role tests all landed in commits `5880d317` and `96b4553f`.

It is **not yet ready for a full production launch with real schools**. The fastest credible path is to close the remaining Phase 0 launch blockers (mock/demo ambiguity, operational HTTP endpoints, dynamic-data audit logging, and real Vercel/Neon runtime evidence), then Phase 1 hardening, then Phase 2 scale work.

| Milestone | Focus | Open items |
|---|---|---:|
| [Phase 0 — Launch Blockers (P0)](https://github.com/singhaditya21/school-sis/milestone/1) | Must fix before any production launch | 4 |
| [Phase 1 — Production Hardening (P1)](https://github.com/singhaditya21/school-sis/milestone/2) | Security/reliability/provider evidence at launch | 10 |
| [Phase 2 — Quality, Maintainability & Scale (P2)](https://github.com/singhaditya21/school-sis/milestone/3) | Debt reduction & scale readiness | 5 |

**Totals**: 10 open · 9 in progress · 1 verified done · 19 tracked issues.

**Status legend**: 🔴 Open · 🟡 In progress (partially addressed) · 🟢 Done (verified).

---

## Phase 0 — Launch blockers (P0) · [milestone](https://github.com/singhaditya21/school-sis/milestone/1)

These block production go-live. Target: close first.

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#16](https://github.com/singhaditya21/school-sis/issues/16) | Add audit logging for dynamic metadata data-API reads and writes | 🟡 In progress | `access-control`, `data-engine`, `observability` |
| [#17](https://github.com/singhaditya21/school-sis/issues/17) | Remove or hard-isolate mock/demo/fixture surfaces from runtime integration code | 🔴 Open | `integrations`, `security`, `notifications` |
| [#18](https://github.com/singhaditya21/school-sis/issues/18) | Capture strict production runtime evidence and add a strict infra release gate | 🟡 In progress | `infra`, `observability`, `database` |
| [#19](https://github.com/singhaditya21/school-sis/issues/19) | Remove operational HTTP endpoints /api/force-migrate and /api/seed or make them local-only | 🔴 Open | `security`, `infra`, `database` |

## Phase 1 — Production hardening (P1) · [milestone](https://github.com/singhaditya21/school-sis/milestone/2)

Required at or immediately around launch.

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#20](https://github.com/singhaditya21/school-sis/issues/20) | Tighten Content-Security-Policy: remove script-src unsafe-inline/unsafe-eval | 🔴 Open | `security`, `frontend`, `payments` |
| [#21](https://github.com/singhaditya21/school-sis/issues/21) | Make the mobile app production-ready (real auth, secure payment context) or gate it | 🟡 In progress | `mobile`, `payments`, `security` |
| [#22](https://github.com/singhaditya21/school-sis/issues/22) | Remove or reconcile legacy payment create-order route forwarding to localhost:8080 Java backend | 🔴 Open | `payments`, `integrations`, `security` |
| [#23](https://github.com/singhaditya21/school-sis/issues/23) | Decide the Go gateway: secure it as a real edge or remove it from production | 🔴 Open | `services`, `security`, `rate-limiting` |
| [#24](https://github.com/singhaditya21/school-sis/issues/24) | Remove the unused legacy R2 storage adapter that uploads via unsigned raw fetch | 🔴 Open | `storage`, `security` |
| [#25](https://github.com/singhaditya21/school-sis/issues/25) | Provide notification provider evidence or disable unsupported channels (WhatsApp/push mock; no delivery-receipt ingestion) | 🟡 In progress | `notifications`, `integrations`, `observability` |
| [#26](https://github.com/singhaditya21/school-sis/issues/26) | Formalize RLS/database security: policy matrix, real Postgres isolation tests, bypass review, verify-full SSL, migration gates | 🟡 In progress | `database`, `security`, `testing` |
| [#27](https://github.com/singhaditya21/school-sis/issues/27) | Stop tracking generated/session artifacts (.agents/**, *.tsbuildinfo, build.log, server.log) | 🔴 Open | `hygiene`, `devex` |
| [#28](https://github.com/singhaditya21/school-sis/issues/28) | Add AI eval suites, per-tenant token/cost budgets, model fallback, and red-team tests for agent/copilot | 🟡 In progress | `ai`, `testing`, `rate-limiting` |
| [#29](https://github.com/singhaditya21/school-sis/issues/29) | Make rate limiting fail closed (or degrade stricter) on backend outage for public/AI endpoints | 🔴 Open | `rate-limiting`, `security`, `services` |

## Phase 2 — Quality, maintainability & scale (P2) · [milestone](https://github.com/singhaditya21/school-sis/milestone/3)

Debt reduction and scale-readiness; parallelizable with pilot operations.

| Issue | Title | Status | Areas |
|---|---|---|---|
| [#30](https://github.com/singhaditya21/school-sis/issues/30) | Reduce static risk debt (console.*, any, raw SQL, alerts) with downward-only CI thresholds | 🔴 Open | `hygiene`, `observability`, `devex` |
| [#31](https://github.com/singhaditya21/school-sis/issues/31) | Harden website lead capture: production API env, anti-bot controls, consent, CRM routing | 🟡 In progress | `website`, `integrations`, `observability` |
| [#32](https://github.com/singhaditya21/school-sis/issues/32) | Enforce pnpm toolchain via Corepack and a preflight guard; document in dev guide | 🟡 In progress | `devex`, `infra`, `hygiene` |
| [#33](https://github.com/singhaditya21/school-sis/issues/33) | Migrate middleware to proxy convention and revisit static cache headers for Next.js 16 | 🔴 Open | `infra`, `devex` |
| [#34](https://github.com/singhaditya21/school-sis/issues/34) | Complete side-service test tooling and CI for Python/Go/Rust services | 🟡 In progress | `testing`, `services`, `devex` |

---

## Verified done since the audit

| Audit finding | Outcome | Evidence |
|---|---|---|
| P0 #1 — Single enforced access-control model | 🟢 Done | Centralized `lib/auth/page-access.ts` + `lib/auth/api-access.ts`; middleware classifies by real emitted URLs; student guard restored in `app/student/layout.tsx`; NextAuth removed (unified on Iron Session); route-inventory + wrong-role test suites (`__tests__/page-access-policy.test.ts`, `api-access-policy.test.ts`). Commits `5880d317`, `96b4553f`. |

_Minor residual hygiene from #1 (delete dead `app/(platform)/layout.tsx` and the empty `app/api/auth/[...nextauth]` dir) is folded into the repository-hygiene issue._

---

## Phased execution plan

Adapted from the audit's closure plan, updated for current state (access control already closed).

### First 48 hours (Phase 0)
1. Remove production mock ambiguity — issue #17.
2. Remove/hard-disable operational HTTP endpoints and the fallback seed credential — issue #19.
3. Add object/field audit logging to the dynamic data API — issue #16 (RBAC + field permissions already enforced).
4. Capture real Vercel/Neon strict runtime evidence + backup/restore drill — issue #18.

### Days 3–7 (Phase 1, first wave)
1. Tighten CSP + header tests — issue #20.
2. Remove/reconcile legacy payment create-order route — issue #22.
3. Remove/replace legacy R2 storage adapter — issue #24.
4. Notification provider evidence or disable channels — issue #25.
5. Decide Go gateway: secure or remove — issue #23.
6. Extend hygiene gate for tracked generated artifacts — issue #27.
7. Make rate limiting fail closed on backend outage — issue #29.

### Weeks 2–4 (Phase 1 completion + Phase 2)
1. RLS policy matrix + real Postgres isolation tests — issue #26.
2. AI eval suites, tenant leakage, model fallback, cost budgets — issue #28.
3. Mobile production auth + secure payment context — issue #21.
4. Static risk-debt reduction with downward-only CI thresholds — issue #30.
5. Website lead-capture hardening — issue #31.
6. Toolchain pinning (Corepack) — issue #32; Next.js proxy migration — issue #33; side-service test tooling — issue #34.

---

## Domain & module readiness (from audit)

| Domain/module | Launch readiness |
|---|---|
| Fees & payments | Strong ledger/verification/webhook/idempotency; close legacy route (#22) + real provider evidence (#25) first. |
| Admissions / Attendance / Exams / Timetable / Library / HR | Pilot after module RBAC tests + tenant-isolation coverage (#26). |
| Transport | Not launch-ready without route/stop tenant review + workflow tests (#26). |
| Parent portal | Web pilot after payment/provider evidence (#25, #21). |
| Student portal | Access guard restored (done); pilot after portal workflow coverage. |
| AI / copilot / agents | Not launch-ready for regulated customers until eval/leakage/fallback/budget evidence (#28). |
| Integrations | Not launch-ready while runtime mock mode exists (#17). |
| Mobile app | Not production-ready until real auth + secure payments (#21). |
| Operator/SRE console | Internal-only until incident/runbook/UAT evidence. |
| Marketing website | Launch-ready after lead-capture ops evidence (#31). |

---

## How to work this roadmap

- Filter by milestone: [Phase 0](https://github.com/singhaditya21/school-sis/milestone/1) · [Phase 1](https://github.com/singhaditya21/school-sis/milestone/2) · [Phase 2](https://github.com/singhaditya21/school-sis/milestone/3).
- Filter by priority label: [`P0`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP0) · [`P1`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP1) · [`P2`](https://github.com/singhaditya21/school-sis/issues?q=is%3Aissue+is%3Aopen+label%3AP2).
- Each issue lists only **residual** done-criteria (already-completed work is excluded) and re-verified `file:line` evidence.
