# Phase 0–4 Validation Record

Date: 2026-09-10

## Release interpretation

The numbered operational release plan and the longer product roadmap use overlapping phase labels. This release validates the completed operational foundation from Phases 0–2 and ships secure, usable foundations for the Phase 3 and Phase 4 product domains. It does not represent completion of every multi-year roadmap capability.

## Phase 0–2 validation scope

| Area                 | Validation target                                                        | Status                                                                                |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Core SIS and tenancy | Tenant-bound access, role guards, production migration chain             | Implemented; covered by unit, tenancy, and migration tests                            |
| Security and privacy | CSP, rate limiting, encrypted PII paths, masking, audit controls         | Implemented; production environment and readiness checks required                     |
| Deployment safety    | Vercel contract, immutable migration manifest, production release gates  | Implemented; validated by build and release-gate tests                                |
| Integrations         | Signed object storage, provider notification adapters, receipt ingestion | Implemented; live provider credentials remain an operator dependency                  |
| AI foundation        | Grounded tools, tenant budgets, observability and safety contracts       | Implemented; production credentials and usage monitoring remain operator dependencies |
| CRM lead forwarding  | Signed webhook handoff                                                   | Implemented; external CRM webhook URL and secret remain an operator dependency        |

## Phase 3 foundation delivered

- Higher-education program and course creation now uses authenticated, tenant-scoped writes.
- Faculty workload metrics are read from production data instead of placeholders.
- Coaching batches and test series are created against the signed-in tenant.
- Coaching participation, upcoming-test, result, and average-score metrics are data-backed.
- Unsupported research, accreditation, and placement-exchange claims are labeled as future rollout items.

Remaining Phase 3 roadmap work includes full degree audit and transcript workflows, research and grants administration, employer placement exchange, accreditation evidence, personalized study plans, facilities and sustainability, and student-voice workflows.

## Phase 4 foundation delivered

- Visa records use tenant-scoped student selection and encrypted passport identifiers.
- Passport values are masked before rendering.
- Host-family contacts use encrypted phone storage.
- International placements validate both students and host families against the signed-in tenant.
- The dashboard provides real visa, host-family, and placement create/read workflows.

Remaining Phase 4 roadmap work includes multi-currency treasury, international curriculum mapping, global accreditation, equity and crisis workflows, xAPI/LMS interoperability, advanced offline support, enterprise white-label design, and national financial-aid integrations.

## Release evidence required

The release is ready only after the repository unit suite, migration manifest check, application build, Neon migration ledger, encrypted-column backfill audit, Vercel production deployment, and public health checks all pass. Provider-dependent integrations must be reported separately and must not be described as live without credentials and receipt evidence.

## Validation result

- Unit suite: 84 suites and 748 tests passed.
- Production build: Next.js compilation and TypeScript validation passed locally and on Vercel.
- Repository gates: security, secrets, hygiene, risk debt, SQL references, claims, navigation, scheduler, migrations, and RLS matrix passed.
- Neon production: 16 migrations; latest hash prefix `5526bfb78d8c`; encrypted passport column present; zero plaintext passport values.
- Vercel production: deployment `dpl_AjLQroxKZGxGsab3Djt3t6MjA7dn` is Ready and aliased to `https://school-sis-web.vercel.app`.
- Runtime checks: health returned 200/OK, login returned 200, Phase 3–4 routes enforced authentication redirects, and readiness rejected an unauthenticated request with 401.

## Independent source reconciliation — 2026-09-11

The working tree that produced the September 10 deployment was revalidated before being moved off the `feat/pii-users-email-DONOTMERGE` branch:

- Required runtime: Node 24.19.0.
- Unit suite: 84 suites and 748 tests passed.
- Maintained Playwright smoke suite: 5 of 5 tests passed against a freshly created local PostgreSQL database.
- Repository build: both the application and marketing website compiled and passed TypeScript validation.
- Lint: zero errors; pre-existing warnings remain outside this release scope.
- Repository audit suite: passed, with two documented mobile-only advisories temporarily accepted until 2026-09-15.
- Migration chain: 16 migrations, strictly increasing and hash-aligned with the generated manifest.
- Generated database types: current against production Neon.
- PII rotation audit: zero pending values across all registered encrypted fields.
- Neon production: 16 migrations, latest hash prefix `5526bfb78d8c`; zero plaintext or missing-ciphertext passport values.
- Vercel production: deployment `dpl_AjLQroxKZGxGsab3Djt3t6MjA7dn` remains Ready; health and login return 200 and unauthenticated readiness returns 401.

The project-level Vercel environment pulled to a local workstation contains an outdated short `METRICS_TOKEN`. The protected GitHub production Environment remains the release source of truth and injects its validated token into the immutable build and deployment. Manual local production deployment is therefore not an approved release path until the Vercel project value is reconciled; releases must use the protected GitHub workflow.
