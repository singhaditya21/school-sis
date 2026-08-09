# ScholarMind product truth and delivery roadmap

Last reviewed: 2026-08-09

This document is the release contract for ScholarMind. Route count is not product readiness. A capability is available only when its data, authorization, persistence, failure states, provider dependencies, tests, and operating evidence have passed the corresponding gate.

## Positioning and sequence

ScholarMind is being built as the governed shared-services operating platform for mixed education groups: identity, treasury, policy, migration, credentials, and auditable automation across institution types.

The delivery sequence is:

1. India multi-campus K-12.
2. International school groups.
3. Private and autonomous higher education.

Multi-campus, all-in-one, and AI messaging are not treated as defensible by themselves. Release decisions prioritize working governance, migration, evidence, and cross-segment shared services.

## Capability lifecycle contract

The typed registry in `apps/web/src/lib/capabilities` is the code-owned product boundary.

- `HIDDEN`: unavailable in production navigation, direct page access, server actions, and guarded APIs.
- `INTERNAL`: available only to explicitly enabled platform validation contexts.
- `PILOT`: visible only with the commercial entitlement and all code/provider/role prerequisites.
- `GA`: supported product capability, still narrowed by role, tenant, institution type, and entitlement.

`companies.active_modules` is the commercial entitlement source. It can narrow access but cannot promote code-owned `HIDDEN` or `INTERNAL` functionality. Session capability revisions invalidate stale authorization context after registry changes.

Truth-state rules:

- Empty, unavailable, unconfigured, failed, forbidden, and not found are distinct states.
- Tenant and actor identity are derived on the server for every mutation.
- A success state requires a durable database commit or verified provider acknowledgement.
- Runtime demo records, fake delays, random client application identifiers, and fallback-to-zero provider failures are forbidden on released surfaces.
- Test fixtures remain valid only in tests, E2E, seeds, stories, and explicitly guarded mock modules.

## Current implementation checkpoint

This tree contains the first foundation pass, not the completed 12-week program:

- A central capability registry, common evaluator, server guard, guarded routes/APIs, caller-safe capabilities endpoint, and capability-revision sessions.
- Hidden release state for AI, compliance, coaching/quiz, higher education, international operations, and mobile.
- Transactional company/tenant/admin onboarding with an atomic audit record.
- Privileged-role MFA enrollment with locked/idempotent setup, QR/TOTP verification, recovery codes, atomic activation audit, and fail-closed session/API enforcement.
- Session-bound student and teacher identity surfaces.
- A database-backed timetable grid plus atomic, tenant-validated timetable mutations with teacher, section, room, and break-period conflict checks.
- Tenant-scoped, audited fee-plan editing with optimistic concurrency.
- Persisted tenant grading configuration with continuous-range validation, exactly one default, audit records, optimistic concurrency, and marks calculation wired to the active scheme.
- Canonical read-only system-role policy; role mutation remains in the approval workflow.
- Database-only treasury views and actions with capability/permission enforcement, session-tenant scoping, exact decimal currency groups, and explicit legacy currency limitations.
- Persistent exam-result review state, rejection history, reviewer evidence, correction reset, and publication blocking until every result is verified.
- Native tenant/ownership-scoped receipt and published report-card PDFs at the existing URLs.
- Shared design-token, web UI, and native UI foundation packages.
- Token-driven login, dashboard, parent overview, mobile unavailable state, and native PDF adoption slices.
- Truthful marketing, package, architecture, admissions, AI-governance, README, and operations content.
- A downward-only product-truth and raw-style debt ratchet in `scripts/check-product-truth.mjs`.

Public admissions remains deliberately unavailable until tenant-aware persistence and payment acknowledgement exist. This checkpoint does not claim Storybook/axe coverage, production AWS deployment, provider readiness, full design-system adoption, complete core workflow E2E, migration-grade imports, or pilot acceptance.

## First 12 weeks

| Milestone | Work | Exit gate |
| --- | --- | --- |
| M0 — Product truth, Weeks 1–2 | Complete capability classification and guards, derive navigation from the registry, remove remaining broken links and runtime fixtures, reconcile all public/docs claims. | Every visible capability is `PILOT` or `GA`; direct hidden access fails; no fabricated released state; no broken production link. |
| M1 — Design system, Weeks 2–4 | Complete semantic primitives and patterns, responsive shared shell, Storybook, interactions, keyboard/axe checks, snapshots, and debt ratchet adoption. | Web/website/Expo builds pass; WCAG 2.2 AA checks pass; no new raw style/control debt. |
| M2 — Core workflow truth, Weeks 3–6 | Persist grading; complete marks review history, dashboards, admissions, fee/treasury workflows, identities, and native PDFs; remove retired Java fallbacks. | Reload proves every enabled mutation; cross-tenant attempts fail; provider failures are explicit; enabled controls are functional. |
| M3 — Pilot spine, Weeks 5–10 | Academic setup through admissions, enrollment, attendance/timetable, exams/report cards, fees/refunds/receipts, communications, and staged migrations. | Two anonymized migrations reconcile; critical role E2E passes; no unexplained financial variance; provider/PDF drills pass. |
| M4 — Cloud and pilot, Weeks 9–12 | AWS Mumbai target, backups/restore, monitoring, CI/CD, nightly Playwright, runbooks, and paid design-partner UAT. | P0 is zero; restore/rollback proven; 99.9% SLO measured; providers and support ownership verified. |

## Months 3–24

- Months 3–6: finish paid K-12 and international design-partner pilots, migration tooling, provider evidence, and critical design-system adoption.
- Months 7–12: Wave-1 GA with group hierarchy, shared staff, cross-campus transfers, policy inheritance, consolidated treasury, multi-currency, multilingual workflows, and international controls.
- Months 13–18: higher-education coexistence pilot covering catalogs, credits, registration, degree audit, exams, transcripts, advising, accreditation, and placements.
- Months 19–24: controlled higher-ed GA, portable credentials, procurement evidence room, then low-risk governed AI. Mobile remains last and requires versioned bearer authentication, rotating secure refresh tokens, server-owned payment context, push evidence, and device testing.

## Release evidence

Required evidence is maintained in code and CI:

- Capability lifecycle × entitlement × role × institution × provider tests.
- Real non-superuser PostgreSQL tenant-isolation tests for every new table/action.
- Persistence, concurrency, idempotency, partial-failure, retry, and audit tests.
- Exact invoice/payment/refund/settlement/receipt reconciliation.
- Migration dry-run, duplicate, interruption, rollback, reconciliation, and finalization tests.
- Accessibility, keyboard, reduced-motion, contrast, responsive, and visual checks.
- Critical Playwright on release candidates; full suite nightly with retained artifacts.
- Backup restore, provider probes, incident ownership, and signed customer UAT before pilot release.

The CI ratchet baseline records existing debt per rule and file. New debt fails immediately. Any reduction must lower the reviewed baseline so removed debt cannot return.
