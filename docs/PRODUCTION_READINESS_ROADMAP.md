# Production Readiness Roadmap

Last updated: 2026-07-03

This roadmap is the current gap map for taking School SIS from an architecturally complete product foundation to a production-ready operating system. It supersedes older broad audit notes where they conflict with the current codebase.

## Current State

The project is no longer missing its core architecture pillars. The main foundations are in place:

- Tenant isolation with RLS-oriented database access and tenant-scoped app routes.
- Workflow approvals for high-risk actions such as finance refunds, invoice cancellations, student transfer/archive, exam publication, identity role changes, and agent approval review.
- Payment ledger architecture with Stripe/Razorpay provider abstraction, payment orders, audit logs, provider event idempotency, and local Razorpay webhook hardening work.
- Durable background job and notification outbox architecture.
- AI agent gateway architecture with tenant-authenticated web proxying.
- Governed BI/reporting catalog and export policy model.
- Operator console contract, action catalog, runbook catalog, and durable operator tables.
- Identity foundation with Iron Session, MFA enforcement for privileged roles, SSO, SCIM-style provisioning, and support impersonation.
- Observability/SRE primitives: health, protected readiness/metrics, SRE incidents, SLO tables, and structured logging.

The remaining work is mostly production hardening, operational tooling, provider cutover, test coverage, and removal of mock or prototype paths.

## Recently Shipped And Current Track 1 Changes

The prior security-hardening and CI/CD stabilization work has been committed, pushed, deployed, and smoke-tested in production. The verified production commit for that baseline is `dc061edd7ebbd520fc6dc04cc39cc89b72e503ac`.

- Added `jspdf >=4.2.1` override and lockfile updates.
- Added tenant host/session validation in middleware, including tenant subdomain/custom-domain matching.
- Hardened public lead capture with rate limiting.
- Hardened exam creation with permission checks and tenant-scoped form parsing.
- Added Razorpay webhook signature verification and server-to-server payment webhook ingestion.
- Added webhook idempotency and cross-tenant-safe provider order reconciliation helpers.
- Hardened production crypto/KMS behavior by rejecting placeholder secrets and failing closed in production.
- Replaced several string/interpolated logs with structured logging.
- Removed demo-password comments from legacy SQL seed migrations.
- Stabilized GitHub Actions by moving CI/E2E to Node 24.
- Split Playwright into a push/PR smoke gate and a manual/nightly full sharded suite with explicit timeouts.
- Updated Playwright to run the standalone Next.js server output for CI smoke tests.
- Expanded the production runtime checker so strict mode now validates tenant base hosts, production app URL shape, payment secrets, required notification providers, storage/CDN URLs, cron scheduler secrets, backup retention, restore-drill evidence warnings, agent-service readiness, and error-tracking gaps.
- Added a cron-compatible `GET /api/jobs/dispatch` path secured with `CRON_SECRET` while preserving the existing `POST` dispatcher secured by `JOB_DISPATCH_SECRET`.
- Declared the Vercel Cron schedule for `/api/jobs/dispatch` in `apps/web/vercel.json`.
- Added regression coverage for strict production runtime validation.

Verification after the hardening and CI/CD pass:

- `pnpm test:unit`: 20 suites, 114 tests passing.
- `pnpm test:architecture`: passing.
- TypeScript check for `apps/web`: passing.
- `pnpm audit --audit-level=high`: no high or critical findings; 7 low and 15 moderate findings remain.
- GitHub `CI/CD Pipeline`: passing on `dc061edd`.
- GitHub `E2E Tests`: passing on the push/PR smoke gate.
- Vercel production `/api/health`: passing and serving `dc061edd`.
- Neon: no schema or migration action was required for this CI/CD stabilization.
- Current roadmap implementation note: the scheduler and stricter checker are in code, but production completion still requires real Vercel secrets (`CRON_SECRET`, provider secrets, storage, backup retention, tenant hosts), an observed cron run, and restore-drill evidence.

## Definition of Production Ready

School SIS should be considered production ready only when all of these are true:

- Production deploy is reproducible from the repository root to the intended Vercel project.
- Production migrations are applied through reviewed Drizzle migrations using `DIRECT_URL`, never `db:push`.
- `pnpm infra:check` and strict production runtime checks pass with real production env vars.
- No high or critical dependency advisories remain, and moderate advisories have explicit accept/mitigate/upgrade decisions.
- All public and service API routes have documented auth, signature, token, rate-limit, or intentional-public contracts.
- Core money, identity, PII export, student lifecycle, and agent action flows have approval, audit, tenant isolation, and regression tests.
- Background jobs have a scheduler, retry/dead-letter handling, dashboards, and alerting.
- Payment and notification providers are configured in real provider mode with signed inbound webhooks.
- Backups are enabled, restore has been drilled, and runbooks exist for restore, incident response, provider outages, and migration rollback.
- Critical user journeys are covered by browser tests against an isolated database.

## Project Operating Rules

These rules are the default way to change, migrate, deploy, and verify the project. If a rule must be bypassed, document the reason in the commit, PR, deployment note, or runbook entry.

### Shipping Loop

- Treat work as unfinished until code is committed to GitHub, required Neon migrations are applied, Vercel production deploy is ready, and production smoke checks pass.
- Keep one source of truth for production code: GitHub `origin`, currently `git@github.com:singhaditya21/school-sis.git`.
- Before any commit, run `git status --short` and confirm the diff contains only intentional files.
- Do not include unrelated user changes in a commit. Split unrelated work into separate commits or leave it unstaged.
- Do not commit `.env*` files with secrets, `.vercel/`, `.next/`, `node_modules/`, generated test databases, Playwright reports, backup dumps, local logs, `.tsbuildinfo`, `.codex/`, generated graph/audit caches, or ad hoc scratch scripts.
- Commit generated Drizzle migrations only when the schema change requires them and the SQL has been reviewed.
- Push only after the local verification gate passes or after explicitly documenting why a check was skipped.
- After pushing, verify that `origin/main` or the intended branch matches the shipped commit.
- Prefer a branch and PR for risky or multi-step work. Direct `main` commits are acceptable only for intentional owner-approved shipping.

Recommended GitHub flow:

```bash
git status --short
pnpm test:unit
pnpm test:architecture
pnpm audit --audit-level=high
git add <intentional-files>
git commit -m "<scope>: <summary>"
git push origin <branch>
```

### Verification Gate

- Fast local gate for most app changes:
  - `pnpm test:unit`
  - `pnpm test:architecture`
  - `pnpm audit --audit-level=high`
  - `git diff --check`
- Broader gate before production deploy:
  - `pnpm infra:check`
  - `pnpm --filter @school-sis/web exec drizzle-kit check`
  - `pnpm --filter @school-sis/web exec tsc --noEmit --pretty false --incremental false`
  - `pnpm --filter @school-sis/web run build`
  - `pnpm --filter @school-sis/web exec eslint src --quiet`
- Run E2E smoke or full E2E when the change touches auth, tenant routing, payments, jobs, student lifecycle, role permissions, or browser-critical flows.
- `pnpm audit --audit-level=high` must stay clean for high and critical advisories. Low/moderate advisories need documented upgrade, mitigation, or acceptance decisions.

### Vercel Rules

- Production web runtime is Vercel project `school-sis-web`.
- Deploy from the repository root only. Do not run Vercel commands from `apps/web`; that can bind to a stale local project link.
- The Vercel project root is `apps/web`, and `apps/web/vercel.json` is the deployment source of truth.
- Production builds must use `pnpm --filter @school-sis/web run build`.
- Do not add a root `vercel.json`; the app-level Vercel config is intentional.
- Runtime routes that touch database or secrets must stay Node/serverless routes, not Edge routes.
- Deploy after production migrations succeed, not before, when a change depends on new schema.
- A production Vercel deployment is not complete until it reaches `READY` and production smoke checks pass.

Recommended deploy flow:

```bash
pnpm infra:check
pnpm --filter @school-sis/web run build
pnpm dlx vercel --prod --yes
curl -fsS https://school-sis-web.vercel.app/api/health
```

### Neon and Drizzle Rules

- Neon Postgres is the production database target; Drizzle migrations under `apps/web/drizzle/` are the production schema path.
- Use `DATABASE_URL` for pooled runtime app connections.
- Use `DIRECT_URL` for Drizzle migrations, backup, restore, and other migration/admin operations.
- `DIRECT_URL` must be the direct Neon host, not the pooler host.
- Production database URLs must use `sslmode=require` or `sslmode=verify-full`.
- Change schema in `packages/api/src/db/schema/`, then generate migration SQL with `pnpm db:generate`.
- Review generated SQL and Drizzle journal changes before applying to Neon.
- Apply production migrations only with the explicit guard:

```bash
DIRECT_URL="postgresql://..." CONFIRM_PRODUCTION_MIGRATION=school-sis pnpm db:migrate:prod
```

- Never run `db:push` against production. `db:push` is only for local or prototype databases.
- Do not manually patch production schema outside reviewed migrations unless performing a documented emergency repair.
- Before destructive or irreversible migrations, confirm a recent backup exists or run a backup first.
- After migration, verify Drizzle journal continuity if anything indicates replay, skipped migration, or schema drift.

### Environment and Secret Rules

- Production secrets live in Vercel/managed provider secret stores, not in Git.
- Minimum production secrets include `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `PII_ENCRYPTION_KEY` or `ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `METRICS_TOKEN`, and `JOB_DISPATCH_SECRET`.
- Payment production requires real `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
- Tenant host validation requires `TENANT_BASE_HOSTS` and correct tenant code/domain data.
- Notification production requires `REQUIRED_NOTIFICATION_CHANNELS` to match the launch scope. Strict validation defaults to `email,sms`; required channels must use real providers, not `mock`.
- Vercel Cron dispatch requires `CRON_SECRET`; manual or external scheduler POST dispatch requires `JOB_DISPATCH_SECRET`.
- Agent production requires `AGENT_SERVICE_URL`, `AGENT_API_TOKEN`, and agent-side matching secrets.
- Service tokens and secrets should be at least 32 random characters unless a provider requires a different format.
- Production must fail closed on mock, dummy, placeholder, or development secrets for encryption, payment, KMS, and service auth.
- Rotate secrets through a runbook that records owner, age, blast radius, rollout steps, and verification checks.

### Production Smoke Rules

- `/api/health` is the public liveness probe and should return 200 after deploy.
- `/api/ready`, `/api/metrics`, `/api/sre/status`, and external incident ingestion are protected by `METRICS_TOKEN` in production.
- `/api/ready` returning 401 without a token is expected and should not be treated as a failed public health check.
- Smoke checks should cover:
  - public health endpoint,
  - login page,
  - tenant host routing,
  - authenticated dashboard load,
  - invoice/payment initiation,
  - signed payment webhook fixture,
  - job dispatcher call with `JOB_DISPATCH_SECRET`,
  - protected metrics/readiness with `METRICS_TOKEN`.

### Backup, Restore, and Data Rules

- Neon managed backups must be enabled before production launch.
- Run a restore drill before major launch, major migration waves, or irreversible data changes.
- Store production backup dumps outside the repository.
- Never commit backup files, raw database dumps, exported PII, or production customer files.
- Restore operations are destructive and must require explicit confirmation:

```bash
DIRECT_URL="postgresql://..." CONFIRM_RESTORE=school-sis pnpm backup:restore -- ./backups/neon/school-sis.dump
```

### Provider and Webhook Rules

- Stripe, Razorpay, notification, integration, and agent webhooks must verify signatures or bearer service tokens before parsing trusted work.
- Webhook handlers must be idempotent and record provider event IDs before mutating domain state.
- Provider callbacks that affect money, notifications, identity, or integrations must write audit or delivery events.
- Keep provider webhook endpoints updated after every production environment rebuild.
- Use signed fixture tests for webhook regression; do not depend on live provider calls in normal CI.

### Background Job Rules

- Production job execution should use the durable database queue and authenticated `/api/jobs/dispatch`.
- The dispatcher must be called by Vercel Cron or an external scheduler with `JOB_DISPATCH_SECRET`.
- Jobs touching tenant data must enter tenant context before database access.
- Platform jobs must use explicit RLS bypass and should be rare.
- Dead-letter transitions must be visible to operators and should generate SRE incidents or alerts.

### Documentation Rules

- Update architecture docs when implementation reality changes.
- If `docs/ISSUES_AND_ROADMAP.md` conflicts with architecture-specific docs or this roadmap, prefer the newer architecture docs and this roadmap.
- After the current hardening changes ship, update `docs/PAYMENTS_BILLING_ARCHITECTURE.md` so Razorpay webhook ingestion is no longer listed as remaining work.
- Keep this roadmap current when a P0/P1/P2/P3 item is completed, descoped, or replaced.

### Repository Hygiene Rules

- Generated analysis output should not live under source folders such as `apps/web/src` or `services/agents/src`.
- Keep durable audit evidence under `audits/reports/` only, with dates or run metadata. Avoid duplicate root/app-level audit JSON snapshots.
- The root package manager is pnpm. Do not add a root `package-lock.json` unless the project intentionally adds an npm-managed package outside the pnpm workspace.
- If a generated folder is removed from Git, add the matching ignore pattern in the same cleanup PR.
- Do not keep build output in Git. Review and remove generated backend output such as `backend/app/bin/` unless it is proven to be hand-maintained source.
- Keep small diagnostic scripts only if they are wired into `package.json`, CI, or docs. Remove ad hoc scripts after the debugging task is complete.

## Priority Roadmap

### P0: Before Next Production Deploy

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Commit and deploy the security-hardening changes | The repo is locally hardened but production will not benefit until this ships. | Changes are committed, pushed, deployed, and `/api/health` plus an authenticated smoke path pass. |
| Configure new production secrets | Razorpay webhook, tenant host validation, scheduled jobs, storage, and provider cutover need runtime configuration. | `RAZORPAY_WEBHOOK_SECRET`, `TENANT_BASE_HOSTS`, `CRON_SECRET`, real payment secrets, required notification provider secrets, storage secrets, metrics/job tokens, backup retention, and encryption keys are set in Vercel. |
| Run strict production runtime validation | Prevents accidental deploys with mock or missing infrastructure. | `NODE_ENV=production pnpm --filter @school-sis/web run infra:check -- --strict` passes against real production-like env; the checker rejects missing/placeholder tenant, payment, notification, cron, storage, app URL, backup, and core service secrets. |
| Re-run dependency audit and classify low/moderate advisories | High/critical advisories are cleared, but 22 low/moderate findings remain. | Each advisory has upgrade, mitigation, or documented acceptance; CI runs the high-severity audit gate. |
| Add route-boundary contract tests | Many API routes are protected through helpers or middleware; tests should prove the intended boundary. | Public, session, service-token, webhook-signature, and metrics-token routes have automated contract tests. |
| Lock down prototype endpoints | `/api/mock`, `/api/seed`, and `/api/force-migrate` are gated, but should be formally excluded from production use. | Production returns 404/403 as intended, contract tests exist, and docs say how to seed/migrate safely. |
| Production smoke checklist | The app has many interconnected modules, so deploy success alone is not enough. | Login, tenant routing, dashboard load, invoice payment initiation, payment webhook fixture, receipt access, job dispatch, and metrics readiness are checked. |
| Backup and restore drill | Database restore is the last line of defense for migration or operator mistakes. | Neon backups are enabled and one restore drill is recorded before launch. |

### P1: Operational Backbone

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Background job scheduler | Durable jobs exist, but a scheduler must call `/api/jobs/dispatch`. | Vercel Cron or external scheduler dispatches jobs every minute with `CRON_SECRET` for cron GETs or `JOB_DISPATCH_SECRET` for manual/external POSTs, and the first production dispatch is observed in logs. |
| Job and notification dashboards | Dead letters and failed messages need operator visibility. | Operator/admin screens show queued, failed, locked, and dead-letter jobs plus notification outbox status. |
| Per-tenant notification quotas and rate limits | Prevents noisy tenants or message loops from affecting everyone. | Quotas are enforced per tenant/channel with audit events and operator overrides. |
| Provider delivery receipts | Outbound notifications need provider status reconciliation. | SMS, WhatsApp, email, and push receipt webhooks update `notification_delivery_events`. |
| On-call alert routing | SRE incidents exist but need notification routes. | Critical SRE incidents page/email/SMS/on-call destinations with dedupe. |
| Error tracking and source maps | Production debugging needs stack traces and release correlation. | Managed error tracker DSN is configured and source maps upload during build/deploy. |
| Multi-region uptime probes | `/api/health` and `/api/ready` need external verification. | Synthetic probes run from multiple regions and write SLO measurements/incidents. |

### P1: Payments and Revenue Operations

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Partial refunds | Current approved refund architecture focuses on full-payment refunds. | Partial refund requests, approvals, provider calls, ledger updates, and receipts are tested. |
| Chargebacks and disputes | Provider disputes can desynchronize money and invoice state. | Stripe/Razorpay dispute events create audit entries, operator tasks, and ledger adjustments. |
| Reconciliation dashboard | Operators need to see unmatched orders, failed provider events, and duplicate events. | `/operator` or finance UI exposes provider events, unmatched orders, retry actions, and audit history. |
| Webhook regression fixtures | Payment webhook correctness is high risk. | Stripe and Razorpay signed fixture tests cover capture, failure, duplicate, missing order, and invalid signature cases. |

### P1: Operator Console Productization

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Build `/operator` UI | The console contract exists, but operators need a real surface. | Platform and tenant operators can view health tiles, runbooks, incidents, jobs, payments, integrations, and approvals. |
| Operator action endpoints | Action catalog exists, but execution must be audited and safe. | Retry/replay/resolve/reconcile/rotate/suspend endpoints write `operator_console_action_logs` before domain work. |
| Scheduled snapshots | Historical trend charts need persisted snapshots, not only live state. | Background job writes snapshots for trend views and audit review. |
| MTTA/MTTR dashboards | Incident response quality needs measurable outcomes. | Console shows incident MTTA, MTTR, reopen rate, action success rate, and queue latency. |

### P2: AI Agent Production Boundary

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Private agent service deployment | Browser calls are proxied, but the Python service must not be public. | `AGENT_SERVICE_URL` targets a private service boundary and only the web app can reach it. |
| Dedicated ARQ worker | Async agent jobs need an always-on worker separate from web requests. | Agent jobs are processed by a deployed worker with health checks and restart policy. |
| Replay-safe indexing/event table | LISTEN/NOTIFY can lose events during outages. | Student/invoice indexing events are durably stored and replayable. |
| Role-aware agent tool permissions | Tenant membership alone is not enough for all tools. | Agent tools check role, permission, ownership, and field sensitivity before execution. |
| Agent observability | Token use, indexing lag, and failed jobs affect cost and trust. | Dashboards show audit logs, token usage, model mix, indexing lag, failed jobs, and approval latency. |
| Retire legacy `agent_approvals` writes | Approval architecture should converge on the generic workflow engine. | Legacy table is archived or compatibility-only after all agent actions create `agents.approval.review` requests. |

### P2: Reporting, BI, and Exports

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Real BI query executor | Catalog validation exists, but dashboards need parameterized execution. | Approved metric/dimension IDs map to reviewed SQL templates; callers never send raw SQL. |
| Migrate ad hoc analytics pages | Prevents every dashboard from reinventing tenant/data rules. | Existing analytics pages use the BI executor without changing user-facing behavior. |
| Scheduled reports and snapshots | Operators and schools need history, not only live reads. | Scheduled jobs write `bi_report_runs` and `bi_metric_snapshots`. |
| Report builder persistence | User-authored reports need durable definitions and permissions. | Builder saves to `bi_report_definitions` with tenant ownership and export policy checks. |
| CSV/XLSX export policy layer | Sensitive exports need approval and row limits. | Export endpoints use policy checks, audit reasons, approval metadata, and streaming-safe generation. |

### P2: Identity, Authorization, and Admin UX

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Per-tenant SSO and SCIM admin screens | Global env vars do not scale across customers. | Tenant admins/platform admins can configure providers and rotate SCIM tokens through audited UI. |
| SCIM audit events | Provisioning changes are identity-critical. | SCIM create/update/deactivate events write audit records with actor, tenant, target, and diff summary. |
| Upgrade sensitive services to `evaluateAccess()` | Boolean role checks are not enough for field/ownership policy. | Finance, exports, parent/student self-service, gradebook/attendance, metadata, and integrations pass resource context into the central evaluator. |
| Role-permission matrix API and UI | Settings UI still has a TODO for saving role permissions. | Role permissions can be reviewed and changed through audited API/UI with approval where needed. |
| MFA and privileged-route tests | MFA exists; production confidence needs regression coverage. | Tests cover login, missing MFA, SSO MFA assumptions, impersonation, and privileged route access. |

### P2: Product Mock Retirement

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Legacy `packages/api/src/services/jobs.ts` mock providers | Shared package still has TODOs for SMS/email/WhatsApp providers. | Calls are routed to the durable notification outbox or real provider adapters, with no production mock path. |
| Admin grading settings TODO | Settings screens should mutate real data or clearly be hidden. | Grading schemes load/save through a tenant-scoped API with validation and audit. |
| Admin role settings TODO | Role changes are security-sensitive and should not be UI-only. | Role permission changes call audited APIs and use approval policy where appropriate. |
| Consent tracking placeholder | Dashboard currently uses a placeholder count. | Consent status is backed by privacy/audit data and exposed through metrics. |
| Quiz and timetable placeholders | Some surfaces still communicate mock/prototype behavior. | Quiz attempt/results and timetable grid either use real APIs or are hidden behind feature flags. |
| Settings users mock fallback | Silent fallback can hide API failures. | User settings show explicit error/empty states, not mock data, when the API fails. |

### P2: Repository Cleanup and File Retirement

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Tracked `graphify-out` artifacts | Generated graph/cache output adds noise to search, diffs, security scans, and repo size. Current tracked candidates include `graphify-out/`, `apps/web/src/graphify-out/`, and `services/agents/src/graphify-out/`. | Generated graph outputs are removed or moved to intentional audit artifacts, `.gitignore` blocks future `graphify-out/`, and architecture docs link to source diagrams instead of generated caches. |
| Duplicate audit snapshots | `apps/web/pnpm_audit.json` duplicates the evidence pattern under `audits/reports/`, while older scan snapshots can become stale and misleading. | Keep current dated evidence under `audits/reports/`, remove duplicate app/root snapshots, and document how to regenerate scans. |
| Root npm lockfile in pnpm workspace | The monorepo declares `pnpm@9.15.9`; a root `package-lock.json` can cause accidental npm installs and dependency drift. | Remove or explicitly justify the root `package-lock.json`; keep package-manager guidance in README/quickstart consistent with pnpm. |
| Website npm lockfile policy | `apps/website` has its own `package-lock.json` while `pnpm-workspace.yaml` includes `apps/*`. | Decide whether `apps/website` is pnpm-managed with the workspace lockfile or intentionally npm-managed; remove the extra lockfile if pnpm-managed. |
| Generated backend `bin` output | `backend/app/bin/main/...` appears to duplicate built resources and can trigger stale security findings. | Confirm it is generated build output, remove tracked files such as `backend/app/bin/main/db/migration/V1__initial_schema.sql`, and ignore `backend/app/bin/`. |
| Ad hoc database probe scripts | Files such as `apps/web/test-query.cjs` and `apps/web/test-schema.cjs` look like one-off diagnostics. | Replace useful probes with named scripts under `apps/web/scripts/` or remove them after confirming no docs/CI references remain. |
| Stale broad audit docs | `docs/ISSUES_AND_ROADMAP.md` and `docs/SECURITY_REPORT.md` still contain fixed findings and older severity counts. | Mark them historical, archive them under `audits/`, or update them to point readers to this roadmap and architecture-specific docs. |
| Root setup docs still mention npm paths | Some setup docs still include npm install/recovery instructions even though CI and production use pnpm. | Update `docs/SETUP_GUIDE.md`, quickstart docs, and README snippets so pnpm is the default path and npm instructions are clearly legacy or app-specific. |

### P3: Scale, Compliance, and Launch Excellence

| Gap | Why it matters | Done when |
| --- | --- | --- |
| Database index and query audit | Migrations exist, but hot queries need production-shaped performance checks. | Fee, attendance, dashboard, notification, payment, and BI queries have `EXPLAIN ANALYZE` notes and required indexes. |
| Load tests for queues and approval flows | Background jobs and approvals are cross-cutting bottlenecks. | Load tests cover job dispatch, notification outbox, payment webhook bursts, and agent approval queues. |
| Bundle and page performance budgets | Large dashboards can regress user experience. | CI enforces bundle budgets and key routes meet agreed Core Web Vitals targets. |
| Data retention and deletion runbooks | Compliance is operational, not only schema-level. | Retention, legal hold, export, deletion, and restore-from-backup policies are documented and tested. |
| SOC2-style evidence automation | Manual evidence collection does not scale. | CI, deploy, backup, access review, incident, and audit-log evidence are captured in a repeatable folder/process. |
| Disaster recovery runbook | Launch readiness needs failure-mode practice. | RTO/RPO targets are documented and a restore/failover drill is performed. |

## Audit Notes

### Dependency Posture

- Current high-severity audit gate passes after the `jspdf` override work.
- `pnpm audit --audit-level=high` currently reports 22 remaining low/moderate findings.
- Add a recurring dependency review that distinguishes runtime production risk from dev-only build/test risk.

### API Boundary Posture

- The API route surface is broad, with session-authenticated routes, public routes, service-token routes, metrics-token routes, provider webhooks, and compatibility routes.
- Some routes are intentionally public (`/api/health`, lead capture, provider webhooks), but public intent should be encoded in tests.
- Some routes are protected by middleware or route-policy metadata rather than obvious inline checks. Contract tests should verify observed behavior.
- Prototype routes such as mock data, seed, and force migration must stay blocked or unavailable in production.

### Environment and Secret Posture

- Production needs real provider values instead of mock defaults for payments, notifications, storage, and agent services.
- Production should fail closed on placeholder encryption/payment/KMS secrets.
- `TENANT_BASE_HOSTS` should be configured before relying on subdomain tenant validation.
- Secrets should have rotation runbooks, owner, age, blast radius, and verification commands.

### Documentation Drift

- `docs/ISSUES_AND_ROADMAP.md` still contains older findings that are now partly fixed, including items addressed by the current hardening pass.
- Architecture-specific docs are more current and should remain the source of truth.
- After the hardening changes ship, update `docs/PAYMENTS_BILLING_ARCHITECTURE.md` to remove Razorpay webhook ingestion from remaining work.

### Repository Hygiene Posture

- Current tracked cleanup candidates include generated `graphify-out` folders in the repo root, `apps/web/src`, and `services/agents/src`.
- Current tracked audit artifacts include `audits/reports/*` plus at least one duplicate app-level audit snapshot. The target state should keep one intentional evidence location.
- The root workspace is pnpm-managed, but a root `package-lock.json` is tracked. This should be removed or explicitly justified.
- `apps/website` is included in the pnpm workspace but has its own npm lockfile. Decide and document whether that app is workspace-managed or independently npm-managed.
- `backend/app/bin/main` appears to contain generated output and should be removed from source control if confirmed.
- Scratch scripts should be promoted into maintained scripts or removed.

## Broad Product Roadmap Execution Tracks

The 10 tracks below are the agreed broader roadmap view. They sit above the detailed deep-audit rows and should be used for planning epics, sequencing milestones, and deciding what is left after CI/CD stabilization.

| Track | Priority | Owner | Objective | Immediate next actions | Done when |
| --- | --- | --- | --- | --- | --- |
| 1. Production launch blockers | P0 | Engineering/DevOps/Security | Remove the remaining blockers before handling real customer or pilot data. | Audit production env vars, configure real provider secrets, verify tenant host config, run strict infra checks against production-like env, add protected-route tests, add signed webhook fixtures, configure scheduler, and run a backup/restore drill. | Real env validation passes, provider secrets are live, smoke checks cover authenticated flows, scheduler works, webhooks are fixture-tested, and restore evidence is recorded. |
| 2. Module readiness | P0/P1 | Product/Engineering | Prove each product module is launchable with real APIs, tenant safety, approvals, audit, and tests. | Convert the domain maturity matrix into module epics for Fees, Identity, Admissions, Attendance, Exams, Timetable, Parent Portal, Transport, HR, Library, AI, BI, and Operator Console. | Each module has real API status, mock/prototype status, tenant isolation, audit logging, approval requirements, test evidence, and launch-readiness signoff. |
| 3. Security and database hardening | P0/P1 | Security/Engineering/DevOps | Make the security posture defensible beyond happy-path deployment. | Tighten CSP, add CSRF/origin checks for sensitive mutations, define WAF/rate-limit policy, maintain RLS matrix, add real Postgres tenant-isolation tests, enforce least-privilege DB roles, and add migration drift detection. | Security controls are documented, tested, monitored, and tied to owners; tenant isolation and migration safety have repeatable evidence. |
| 4. Operational backbone | P1 | DevOps/SRE/Product | Give operators enough tooling to run the platform without direct database access. | Configure Vercel Cron or an external scheduler, build job/dead-letter dashboards, add notification dashboards, start operator console UI, wire alert routing, and finalize incident runbooks. | Operators can see health, queues, failed jobs, notifications, incidents, payments, and runbooks from product surfaces with audited actions. |
| 5. AI production readiness | P2 | AI/Engineering/Security | Move AI from architecture-ready to trust-ready. | Deploy private agent service, deploy dedicated worker, add prompt-injection tests, tenant leakage tests, tool-permission checks, token/cost budgets, model fallback rules, and AI incident response. | AI actions are private, tenant-scoped, permission-aware, auditable, budgeted, and covered by safety eval evidence. |
| 6. BI, reporting, and exports | P2 | Product/Engineering/Data | Replace ad hoc reporting with governed analytics and safe exports. | Implement BI executor, migrate analytics pages to approved SQL templates, add scheduled reports, enforce export policies, add row limits, and audit sensitive exports. | Dashboards use governed metrics, scheduled reports run, exports are policy-controlled, and PII access is approved/audited. |
| 7. Pilot and UAT | P1 | Product/Implementation/Customer Success | Define and run the first controlled pilot without sliding into unbounded custom services work. | Define pilot shape, campus count, imported data, workflows proven, success metrics, UAT owners, customization limits, training, hypercare, escalation, and go/no-go gates. | A pilot can start with signed scope, migration plan, UAT checklist, rollback plan, support plan, success metrics, and executive signoff. |
| 8. Trust, procurement, and accessibility | P1/P2 | Trust/Legal/Product/QA | Prepare buyer-facing evidence for schools, groups, and regulated customers. | Build security/privacy overviews, DPA/MSA/SLA, subprocessors list, deployment matrix, AI governance overview, WCAG target, VPAT plan, keyboard/screen-reader checks, and accessibility CI checks. | Procurement evidence is current, accessibility blockers are tracked, Tier 1 workflows have no critical accessibility blockers, and buyer questionnaires can be answered quickly. |
| 9. Support and customer success | P1/P2 | Support/Customer Success/Product | Make launch adoption repeatable for non-engineering users. | Define support tiers, response SLAs, escalation matrix, onboarding checklist, admin/staff training, help center, release notes, customer health metrics, renewal signals, and feedback triage. | Customers can onboard with guided setup, support has clear SLAs and escalation paths, and product feedback flows into roadmap triage. |
| 10. Commercial packaging and market positioning | P0/P1 | GTM/Product/Finance Ops | Turn the platform into a sellable, margin-aware offer with clear differentiation. | Define Core SIS, AI Pack, Payments Pack, Trust Pack, International Pack, implementation services, pricing assumptions, usage metering, provider fee model, infrastructure cost model, competitor battlecards, buyer personas, wedge messaging, sales deck, and launch channels. | Packages, pricing assumptions, margin model, competitor positioning, launch narrative, and sales materials are ready for pilot and early customer conversations. |

## Deep Audit Launch Readiness Addendum

The sections below expand the roadmap beyond production hardening into launch readiness. Each row uses role owners instead of named individuals.

Priority definitions for this addendum:

- P0: Launch blocker before any real customer or external pilot data is handled.
- P1: Required before the first controlled pilot or paid customer rollout.
- P2: Required before repeatable multi-customer scale.
- P3: Expansion or maturity work after the initial operating model is stable.

### 1. CI/CD Enforcement

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | DevOps/SRE | Add high-severity dependency audit to GitHub Actions | The roadmap requires a clean high/critical gate, but local-only checks do not prevent risky merges. | CI runs `pnpm audit --audit-level=high` on pull requests and `main`, failures block merge, and the workflow artifact records the audit result. |
| P0 | DevOps/SRE | Define branch protection and required checks | Production readiness depends on repeatable gates, not personal discipline. | `main` requires passing CI, build, unit tests, architecture tests, Drizzle check, lint, and audit before merge. |
| P0 | Security/DevOps | Add secret scanning and dependency review | A school platform handles PII, money, and credentials; leaked secrets or risky packages are launch blockers. | GitHub secret scanning, push protection, and dependency review or equivalent checks are enabled and documented. |
| P1 | Engineering | Add PR and release templates | Reviewers need explicit prompts for migrations, tenant isolation, auth, tests, rollout, and rollback. | PR template includes security, migration, env, test, data, and deployment sections; release template captures deploy evidence and smoke checks. |
| P1 | DevOps/SRE | Capture CI and release evidence | SOC2-style readiness needs proof of control operation. | CI artifacts, deploy logs, test summaries, and audit outputs are retained under an agreed retention policy and linked from release notes. |
| P2 | DevOps/SRE | Assign GitHub Actions ownership | Broken pipelines need a clear owner and SLA. | Each workflow has an owner, failure triage SLA, and documented escalation path. |

### 2. Security Headers And CSP Hardening

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Security/Engineering | Review current security headers | Headers already exist, but launch readiness needs a documented baseline and regression checks. | Header expectations for HSTS, frame protection, content type, referrer policy, permissions policy, and CSP are documented and tested against production. |
| P0 | Security/Engineering | Tighten CSP away from broad script allowances | `unsafe-inline` and `unsafe-eval` should not remain permanent without a documented exception. | CSP uses nonces or hashes where feasible, payment-provider exceptions are explicit, and remaining unsafe directives have owner, reason, and removal plan. |
| P0 | Security/Engineering | Add CSRF and origin checks for sensitive mutations | Cookie-backed server actions and API mutations need origin intent checks beyond authentication. | Finance, identity, admin, export, and workflow approval mutations validate origin/referer or use an equivalent anti-forgery control. |
| P1 | Security/DevOps | Add DAST and header regression checks | Static review can miss runtime exposure. | Automated checks validate production headers, common misconfigurations, and unauthenticated sensitive route access. |
| P1 | Security/DevOps | Define WAF and rate-limit policy | Public endpoints, lead capture, auth, payment webhooks, and exports need layered abuse controls. | WAF/rate-limit policy documents thresholds, bypasses, provider webhook allow rules, alerting, and tenant-level throttles. |
| P2 | Security/Engineering | Add CSP violation reporting | CSP tuning needs real browser evidence before strict enforcement. | CSP report-only endpoint or provider is configured, violations are reviewed, and production enforcement is tightened safely. |

### 3. Domain Maturity Matrix

| Priority | Owner | Module | Real API status | Mock/prototype status | Tenant, audit, approval checks | Tests required | Launch readiness done when |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Product/Engineering | Fees and Payments | Payment orders, ledger, providers, and webhooks exist but reconciliation work remains. | Mock gateway paths must be excluded from production. | Tenant-scoped ledger, signed webhooks, approval for refunds/cancellations, audit events. | Webhook fixtures, payment initiation, receipt access, refund/chargeback regression. | Real Stripe/Razorpay mode is configured, smoke tested, reconciled, and operator-visible. |
| P0 | Product/Engineering | Identity and Roles | Iron Session, MFA, SSO/SCIM foundation, impersonation, and RBAC exist. | Role settings UI has unfinished save behavior. | Privileged roles require MFA, impersonation is audited, role changes use approvals where needed. | MFA, role, SCIM, session, tenant-host, and impersonation tests. | Admins can safely manage users/roles without mock fallback or silent failure. |
| P0 | Product/Engineering | Admissions | Basic admissions flows exist, but CRM depth is not production-complete. | Lead/demo capture must be clearly separated from admissions records. | Tenant-scoped applications, audit on status changes, approval for destructive lifecycle changes. | Application create/update, duplicate detection, document handling, status workflow. | Enquiry-to-enrollment works with real data, owner assignment, source tracking, and parent onboarding. |
| P1 | Product/Engineering | Attendance | Core attendance exists. | Any placeholder dashboard counts must be removed or marked. | Tenant scope, student lifecycle integration, audit for corrections. | Teacher entry, correction approval, parent visibility, dashboard rollups. | Daily attendance can be operated by a pilot school without manual DB intervention. |
| P1 | Product/Engineering | Exams and Grading | Exam creation has hardening work; lifecycle status standardization remains. | Grading settings TODO and quiz mocks remain. | Tenant-scoped exams, approvals for publication, audit for mark changes. | Exam create, marks entry, publish approval, report-card export, grading scheme save. | Exams move through explicit lifecycle states and publish safely to parents/students. |
| P1 | Product/Engineering | Timetable and Scheduling | UI surfaces exist but need real scheduling API confirmation. | Timetable placeholders must be removed or feature-flagged. | Tenant scope, conflict audit, override approval for disruptive changes. | Class timetable, teacher conflict, room conflict, parent/student views. | Pilot schools can publish and revise timetables with audit and rollback. |
| P1 | Product/Engineering | Parent Portal | Parent fee and student surfaces exist. | Mock or fallback data must not hide API failures. | Guardian relationship checks, consent controls, PII export rules. | Login, student view, fees, receipt, attendance, notices, access denial. | Parents can complete core journeys on mobile/PWA without staff assistance. |
| P2 | Product/Engineering | Transport | Transport routes and parent transport views exist. | Unassigned placeholders should be intentional empty states. | Tenant scope, student-route assignment audit, safety-critical change logging. | Route create, assignment, guardian visibility, emergency notification. | Transport can be used in pilot with accurate route assignments and parent communication. |
| P2 | Product/Engineering | HR and Workforce | HR appears in architecture and PRD scope but needs module readiness evidence. | Prototype-only staff flows should be inventoried. | Staff tenant scope, role linkage, workload audit. | Staff CRUD, role assignment, workload reporting, cross-campus constraints. | Staff records and workload views are usable for pilot administration. |
| P2 | Product/Engineering | Library and Learning Resources | Library pages exist. | Placeholder inventory/empty states need review. | Tenant scope, issue/return audit, student access controls. | Book issue/return, overdue status, history, student lookup. | Library workflows operate with real data and no mock-only dependencies. |
| P2 | Product/Engineering | AI Agents | Gateway and audit architecture exist; private service/worker boundary remains. | Mock agent triage and legacy approval writes need retirement plan. | Tenant context, tool permission checks, approval workflow, agent audit logs. | Prompt-injection, tenant leakage, tool authorization, approval latency, worker retry. | Agent features are private, audited, permission-aware, and covered by evals. |
| P2 | Product/Engineering | BI and Reporting | Catalog/export policy architecture exists; executor and scheduled reports remain. | Ad hoc analytics pages still need migration. | Tenant scope, approved SQL templates, export audit, approval for sensitive exports. | Metric execution, export policy, scheduled report, row limits, PII denial. | Dashboards use governed BI executor and exports are policy-controlled. |
| P2 | Product/Engineering | Operator Console | Contract and tables exist; UI/productization remains. | Operator actions are not yet fully productized. | Platform role checks, action audit, runbook links, incident ownership. | Health tiles, job retry, payment reconciliation, action logs, incident lifecycle. | Operators can diagnose and resolve common incidents without direct database access. |

### 4. Core Domain Eventing

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Engineering | Standardize mutation entrypoints for critical domains | Direct page/action mutations make audit, approvals, and events inconsistent. | Money, identity, student lifecycle, exams, exports, and agent actions mutate through reviewed services or policy-aware action wrappers. |
| P1 | Engineering | Add lifecycle state machines where missing | Launch support needs explicit state transitions instead of implicit booleans or ad hoc status strings. | Admissions, exams, invoices, payments, refunds, exports, jobs, and notifications have documented states and allowed transitions. |
| P1 | Engineering | Wire persistent domain event outbox module by module | Background jobs, BI snapshots, notifications, and agents need replayable change events. | Each adopted module writes tenant-scoped domain events with event type, aggregate ID, actor, payload summary, and idempotency key. |
| P1 | Engineering/SRE | Add replay and dead-letter handling for domain events | Outages should not lose downstream indexing, notifications, or analytics updates. | Domain events can be replayed safely, failed handlers land in a visible dead-letter state, and replay actions are audited. |
| P2 | Engineering | Create domain event coverage dashboard | Teams need to know which modules are still direct-write or event-dark. | Dashboard or report lists modules, event coverage, last event time, handler failures, and owner. |

### 5. RLS And Database Security Deepening

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Engineering/Security | Maintain RLS policy matrix | Tenant isolation is a core trust claim and must be visible table by table. | Every tenant-owned table has documented RLS status, policy name, bypass rules, tests, and owner. |
| P0 | Engineering | Add real Postgres tenant-isolation regression tests | Mocked DB tests cannot prove RLS behavior. | CI or scheduled test job runs cross-tenant read/write denial tests against real Postgres for critical tables. |
| P0 | DevOps/SRE | Enforce DB role least privilege | Runtime, migration, backup, and support access should not share broad credentials. | Runtime uses least-privilege pooled role, migrations use `DIRECT_URL`, support access is time-bound/audited, and owner docs exist. |
| P1 | Engineering/DevOps | Add migration drift detection | Production schema drift can break Drizzle continuity or hide manual patches. | Drift check runs before deploy/migration and produces a reviewed result; emergency manual changes are documented and reconciled. |
| P1 | Engineering/Product | Require destructive migration review | Student records, money, and audit history cannot be casually altered. | Destructive migrations require backup confirmation, rollback plan, owner approval, and post-migration verification. |
| P1 | DevOps/SRE | Define connection pool and query limits | Multi-tenant traffic can starve Neon or jobs if pools are unbounded. | Runtime pool sizes, worker concurrency, statement timeouts, and queue limits are documented and load tested. |
| P1 | DevOps/SRE | Document backup encryption ownership | Backups are only useful if secure, restorable, and owned. | Backup encryption, storage location, retention, restore access, and restore evidence owner are documented. |
| P2 | Engineering/QA | Harden tenant fixtures and cleanup | E2E and load tests should never leak tenant data across runs. | Generated test DBs, tenant fixtures, and teardown scripts are isolated, named, ignored, and checked for cleanup. |

### 6. AI Evaluation And Safety

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | AI/Product/Security | Add prompt-injection and tool-abuse tests | Agents can touch sensitive education, finance, and identity contexts. | Eval suite attempts instruction override, unsafe tool calls, data exfiltration, and cross-tenant access; failures block AI launch. |
| P0 | AI/Engineering | Add tenant-data leakage evaluations | The AI trust story depends on strict tenant and role isolation. | Tests prove one tenant's prompts, embeddings, files, and audit logs cannot surface to another tenant. |
| P1 | AI/Product | Add grounding and hallucination checks | Schools need trustworthy recommendations and explanations. | AI outputs cite available context, mark uncertainty, avoid unsupported claims, and meet agreed eval thresholds. |
| P1 | AI/Engineering | Enforce role-aware tool permissions | Tenant membership alone is not enough for finance, wellness, identity, or exports. | Every tool declares required permissions, sensitivity level, approval requirement, and denied-action behavior. |
| P1 | AI/Finance Ops | Add token, model, and cost budgets | AI margin and customer trust require cost controls. | Tenant/model budgets, alerts, throttles, and overage handling are visible to operators and package policy. |
| P1 | AI/SRE | Define model fallback and outage behavior | Provider outages should not break critical school workflows. | Model fallback, degraded mode, disabled-tool behavior, and customer-facing status are documented and tested. |
| P1 | AI/Security/SRE | Add AI incident response | AI failures need a specific runbook, not a generic incident note. | Runbook covers unsafe output, data leakage, runaway costs, provider breach, model rollback, and customer notification. |
| P2 | AI/Product | Maintain eval evidence registry | AI quality needs repeatable evidence across releases. | Each model/prompt/tool change links to eval run ID, dataset version, approval, and known limitations. |

### 7. Standards And Interoperability Matrix

| Priority | Owner | Standard or protocol | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Product/Engineering | SAML, OIDC, and SCIM | Enterprise identity is a procurement and security requirement. | Supported flows, configuration UI/API, token rotation, audit events, and known limitations are documented and tested. |
| P1 | Product/Engineering | LTI 1.3 | LMS coexistence matters for schools that will not replace learning tools immediately. | LTI launch, role mapping, course context, security validation, and tenant configuration are versioned and tested. |
| P1 | Product/Engineering | OneRoster, SIF, or Ed-Fi where relevant | Data exchange reduces migration and integration friction. | Segment-specific support status is documented; import/export contracts have fixtures and validation. |
| P1 | Product/Trust | WCAG | Accessibility is a baseline trust requirement, not a premium feature. | WCAG target level, test process, remediation SLAs, and exceptions are documented. |
| P1 | Product/Trust | PCI-aware payment controls | Payment scope must be clear even when providers handle card data. | Shared responsibility, tokenization/checkout boundaries, webhook handling, and evidence are documented. |
| P2 | Product/Engineering | Open Badges and CLR | Credential portability is a strategic differentiator. | Badge/CLR support status, issuer policy, revocation model, consent, and verifier flow are versioned. |
| P2 | Product/Engineering | xAPI and Caliper | Learning event ingestion supports analytics and LMS adjacency. | Event schemas, ingestion contracts, privacy controls, and replay behavior are documented. |
| P2 | Trust/Product | HECVAT-ready evidence packaging | Higher-ed and regulated buyers expect structured procurement evidence. | Evidence pack maps controls, ownership, deployment model, subprocessors, and residual risks. |
| P2 | AI/Product/Trust | AI risk-management mapping | AI governance needs language buyers can evaluate. | AI controls are mapped to model registry, approval policy, audit trail, eval evidence, and incident response. |

### 8. Release Governance

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Engineering/DevOps | Define release train and freeze rules | School operations are calendar-sensitive and cannot absorb surprise changes. | Release cadence, freeze windows, emergency patch rules, and school-year cutover constraints are documented. |
| P0 | Engineering/Product | Add feature-flag lifecycle | Incomplete or risky modules need controlled exposure. | Flags have owner, rollout plan, default state, expiry date, cleanup issue, and tenant targeting rules. |
| P1 | Engineering/DevOps | Define rollback and canary strategy | Production deploys must be reversible. | Each release has rollback command, migration compatibility note, canary/smoke path, and go/no-go owner. |
| P1 | Product/Support | Add customer release notes process | Customers need to know what changed, what to test, and what to train. | Release notes include user impact, admin actions, known issues, migration notes, and support contact. |
| P1 | DevOps/SRE | Define status page update rules | Incidents and planned maintenance need consistent communication. | Status page ownership, update intervals, incident severity mapping, and postmortem trigger are documented. |
| P2 | Engineering/Product | Add semantic versioning or release labels | Support and procurement conversations need stable version references. | Releases are tagged/labeled with changelog, artifacts, migration IDs, and customer-visible summary. |
| P2 | Engineering/SRE | Run post-release reviews | Launch quality should improve over time. | Significant releases get review notes covering incidents, rollback, test gaps, support tickets, and follow-up owners. |

### 9. Pilot And UAT Governance

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Product/GTM | Define first-pilot shape | A vague pilot becomes uncontrolled services work. | First pilot is limited to 1 group, 2 campuses, agreed modules, one academic term of imported data, and documented non-goals. |
| P0 | Product/Implementation | Define data imported for pilot | Migration quality is one of the highest-risk proof points. | Pilot import covers students, guardians, staff, classes, fees, invoices, payments, attendance history, and selected documents with reconciliation tolerances. |
| P0 | Product/Implementation | Define workflows proven in pilot | The pilot should prove the wedge, not every PRD feature. | Pilot demo/proof covers HQ dashboard, admissions funnel, fee payment/reconciliation, attendance, parent portal, approval queue, and support workflow. |
| P1 | Product/Customer Success | Set pilot success metrics | Everyone needs to know whether the pilot worked. | Metrics include implementation time, migration defect rate, payment reconciliation rate, parent activation, support response SLA, uptime, AI approval latency, and admin task completion. |
| P1 | Product/Implementation | Add UAT signoff owners | School operations cross finance, academics, IT, and leadership. | UAT signoff is captured from academic ops, finance, IT/security, principal/admin, and group executive where relevant. |
| P1 | Product/GTM | Define customization limits | Bespoke work can break product repeatability. | Pilot contract lists allowed configuration, blocked custom code, escalation path for product gaps, and decision owner. |
| P1 | Support/Customer Success | Define training rollout and hypercare | Successful launch depends on users, not only code. | Admin training, teacher quickstart, parent communication, hypercare hours, support channel, and escalation SLA are ready. |
| P1 | Product/DevOps | Add pilot go/no-go gates | Data and school calendar risk require explicit gates. | Go/no-go checklist includes migration reconciliation, smoke suite, backup, support readiness, legal docs, and rollback plan. |

### 10. Procurement Evidence Room

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Legal/Trust | Prepare security overview | Buyers need a concise security posture before procurement. | Security overview covers architecture, auth, tenancy, encryption, logging, vulnerability management, backups, and incident response. |
| P0 | Legal/Trust | Prepare privacy overview and DPA | Schools handle minors' PII and need contractual clarity. | Privacy overview, DPA, data roles, data categories, retention, deletion, and cross-border processing terms are approved. |
| P0 | Legal/Trust | Prepare MSA, SLA, and shared-responsibility matrix | Commercial launch needs standard terms and support boundaries. | MSA, SLA, support hours, uptime target, customer responsibilities, and provider responsibilities are ready for pilot signature. |
| P1 | Trust/Product | Prepare AI governance overview | AI will trigger buyer risk review. | AI overview explains approved use cases, human approval, audit logs, model providers, evals, opt-out controls, and incident process. |
| P1 | Trust/Product | Prepare accessibility statement | Accessibility claims need evidence and owner. | Statement lists WCAG target, tested flows, known gaps, remediation policy, and VPAT plan. |
| P1 | Trust/DevOps | Prepare deployment matrix and subprocessors list | Buyers need to know where data lives and who processes it. | Deployment regions, Vercel, Neon, payment, notification, storage, AI, analytics, and support subprocessors are listed with data categories. |
| P1 | Trust/Security | Prepare questionnaire response pack | Repeated security questionnaires can consume the team. | Standard responses exist for SOC2-style, HECVAT-style, AI, privacy, backup, access review, and vulnerability questions. |
| P2 | Trust/DevOps | Automate evidence refresh | Stale evidence weakens procurement trust. | Evidence room has owner, review cadence, last-updated dates, and links to CI/deploy/backup/access review evidence. |

### 11. Accessibility Operating Model

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Product/Design/Engineering | Define WCAG target and Tier 1 workflows | Accessibility must be built into launch scope. | Target WCAG level and Tier 1 flows are documented: login, dashboard, admissions, attendance, fees, approvals, parent portal, and support. |
| P0 | QA/Engineering | Add keyboard and focus testing | Keyboard access is a baseline requirement for core workflows. | Critical flows can be completed with keyboard only, visible focus order is correct, and blockers are tracked by severity. |
| P1 | QA/Product | Add screen-reader testing | Semantic structure and labels need human validation. | Screen-reader smoke tests cover navigation, forms, tables, dialogs, toasts, and errors for Tier 1 workflows. |
| P1 | QA/DevOps | Add automated accessibility checks in CI | Regressions should be caught early. | Playwright or equivalent accessibility checks run for critical pages and create artifacts for review. |
| P1 | Product/Legal | Define VPAT ownership | Enterprise and public-sector buyers may ask for accessibility evidence. | VPAT owner, review cycle, approval workflow, and exception policy are documented. |
| P1 | Product/Support | Add remediation SLAs | Accessibility bugs need predictable response. | Severity definitions and remediation timelines are documented; no critical blockers remain in Tier 1 workflows before launch. |
| P2 | Product/Engineering | Add caption/transcript rules | Media and training content must be accessible too. | Training videos, demos, and support media include captions/transcripts or documented alternatives. |

### 12. Support And Customer Success

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Support/Customer Success | Define support tiers and response SLAs | Customers need clear expectations during launch and hypercare. | Support tiers, hours, channels, response targets, escalation levels, and excluded work are documented. |
| P0 | Support/SRE | Create escalation matrix | Production incidents cross support, engineering, DevOps, finance, and providers. | Matrix lists severity, owner, backup owner, communication channel, escalation time, and customer update cadence. |
| P1 | Customer Success/Product | Build onboarding checklist | Schools need guided setup, not just access to software. | Checklist covers tenant setup, roles, academic year, classes, fees, communication templates, imports, training, and smoke tests. |
| P1 | Customer Success/Product | Prepare admin and staff training | Adoption depends on non-engineers succeeding. | Admin training deck, teacher quickstart, parent launch note, and finance operator guide are ready. |
| P1 | Support/Product | Create help center and release note process | Repeated questions should not become repeated implementation calls. | Help articles exist for login, roles, admissions, attendance, fees, payments, approvals, parent portal, and support escalation. |
| P1 | Customer Success/GTM | Define customer health and renewal signals | Retention needs early warning signs. | Health score includes active users, parent activation, payment success, open incidents, support SLA, module adoption, and executive review status. |
| P2 | Product/Support | Add feedback intake and triage | Pilot learning must become roadmap signal. | Feedback channels, labels, severity, product review cadence, and customer follow-up workflow are documented. |
| P2 | Support/SRE | Prepare incident communication templates | Customer communication should be fast and consistent during outages. | Templates exist for outage, degraded provider, payment delay, data correction, security incident, and maintenance. |

### 13. Commercial Packaging And Margin

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | GTM/Product/Finance Ops | Define launch packages | Sales needs a clear offer and implementation scope. | Core SIS, AI Pack, Payments Pack, Trust Pack, International Pack, and Implementation Services are defined with included modules. |
| P0 | GTM/Product | Define initial wedge pricing assumptions | The first pilots should not become one-off custom deals. | Pricing assumptions define campus/learner bands, implementation fees, AI usage treatment, payment revenue-share position, and pilot conversion rules. |
| P1 | Finance Ops/Product | Track provider fees and AI costs | Payments, messaging, storage, and AI can erode margin. | Cost model tracks Vercel, Neon, storage, email/SMS/WhatsApp, payment gateway, AI tokens, observability, and support effort. |
| P1 | Finance Ops/GTM | Define gross-margin targets | Packaging should protect the business as usage grows. | Target gross margin by package is documented; AI and messaging overages have controls or pass-through terms. |
| P1 | Product/GTM | Define expansion packaging | Land-and-expand needs intentional attach paths. | Add-ons and upgrade triggers are documented for AI Governance, Payments/Reconciliation, Trust/Procurement, International, and BI. |
| P2 | Finance Ops/Product | Add tenant-level usage reporting | Billing, margin, and customer success need usage visibility. | Tenant reports show users, storage, messages, payment volume, AI tokens, jobs, exports, and support load. |

### 14. Generated File Lifecycle

Default artifact policy:

| Priority | Owner | Rule | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Engineering | Generated files are not source by default | Generated artifacts create stale diffs, security noise, and false evidence. | Every generated artifact type is classified as keep, archive, delete, or ignore before commit. |
| P0 | Engineering/DevOps | Ignore runtime and cache artifacts | Local files such as logs, test reports, caches, and build metadata should not enter Git. | `.gitignore` blocks known runtime artifacts and cleanup PRs remove tracked generated output. |
| P1 | Trust/Engineering | Keep durable evidence only in intentional locations | Audit evidence must be findable and current. | Durable security/audit evidence lives under `audits/reports/` or another documented evidence room with date and run metadata. |
| P1 | Engineering/Product | Archive customer or migration evidence safely | Imports, exports, and dry-run outputs may contain PII. | Customer data artifacts stay outside the repo, have retention rules, and are deleted or archived in approved storage. |

Artifact-specific rules:

| Artifact type | Default action | Commit to repo? | Lifecycle rule |
| --- | --- | --- | --- |
| Generated screenshots | Delete or archive outside repo | No | Keep only if used as release evidence; otherwise delete after review. |
| Playwright reports and `test-results` | Ignore/delete | No | CI may retain as artifacts; local output must not be committed. |
| Migration dry-run reports | Archive outside repo if production-relevant | No, unless sanitized docs are created | Keep reviewed summary in docs only when it helps future migrations. |
| Customer imports and export files | Store outside repo | No | Treat as PII; apply retention, encryption, and deletion policy. |
| Audit JSON and scan output | Keep only in evidence location | Usually no | Use dated evidence under `audits/reports/`; remove duplicate root/app snapshots. |
| Local logs, `server.log`, `build.log` | Delete/ignore | No | Regenerate on demand; do not preserve unless attached to an incident record. |
| `.tsbuildinfo` | Ignore/delete | No | Build cache only. |
| `.codex/` | Ignore/delete from repo | No | Local agent workspace state only. |
| `.npm-cache/` | Ignore/delete | No | Package manager cache only. |
| `graphify-out` outputs | Remove or relocate | No by default | Keep only curated diagrams or reports; ignore generated caches. |
| Temporary scripts and probes | Delete or promote | No by default | Keep only if moved under maintained scripts, documented, and wired into package scripts or CI. |
| Generated backend `bin` output | Remove unless proven source | No by default | Confirm source of truth, remove tracked build output, and ignore future output. |

### 15. Source Of Truth And Decision Log

| Priority | Owner | Gap | Why it matters | Done when |
| --- | --- | --- | --- | --- |
| P0 | Product/Engineering | Assign roadmap ownership and update cadence | A roadmap that nobody owns becomes stale quickly. | This roadmap lists owner role, review cadence, and update trigger for shipped changes, descopes, new risks, and launch decisions. |
| P0 | Product/Engineering | Define conflict-resolution order | PRD, architecture docs, roadmap, and shipped code can drift. | Conflict order is documented: shipped code and migrations, current architecture docs, this roadmap, PRD, historical audits, unless an explicit decision overrides it. |
| P0 | Product/Engineering | Add completed-item policy | Completed work should not stay as an open risk. | Completed items are marked with date, evidence link, commit/deploy reference where relevant, and follow-up residual risk. |
| P1 | Product | Add decision log format | Strategic and launch decisions need traceability. | Decisions capture date, owner, context, options, decision, rationale, evidence, and revisit trigger. |
| P1 | Product/Engineering | Define PRD-to-roadmap flow | PRD ambition must become actionable rows instead of floating narrative. | PRD changes are triaged into roadmap rows with priority, owner, done criteria, or explicit deferral. |
| P1 | Trust/Engineering | Define evidence requirements | Launch claims need proof. | Rows involving security, compliance, production, migration, AI, or procurement link to test, audit, runbook, deploy, or signed-off evidence. |
| P1 | Product/Engineering | Archive historical docs deliberately | Old roadmap/security docs can mislead future work. | Historical docs are marked historical, moved under an archive/audit area, or updated to point to current source of truth. |
| P2 | Product/Engineering | Add roadmap health review | The roadmap itself needs quality control. | Monthly review checks stale rows, owner gaps, completed work, missing evidence, and newly discovered risks. |

## Suggested Execution Order

Current status: the security-hardening changes are shipped, GitHub CI is green, the push/PR E2E smoke gate is green, and Vercel production is serving the latest verified baseline commit. The production runtime contract and Vercel Cron wiring have now been added in code; remaining launch work starts with configuring the real production secrets, observing the scheduler, and completing restore evidence.

1. Configure real production env updates in Vercel and run strict runtime validation against those values.
2. Confirm Vercel Cron dispatch: set `CRON_SECRET`, verify `/api/jobs/dispatch` cron logs, and keep manual/external POSTs on `JOB_DISPATCH_SECRET`.
3. Complete CI/CD launch governance: required checks, branch protection, secret scanning, dependency review ownership, and release evidence.
4. Tighten API/security boundaries: route-boundary tests, payment webhook fixtures, CSP plan, CSRF/origin controls, and WAF/rate-limit policy.
5. Deepen database safety: RLS policy matrix, real Postgres tenant-isolation tests, least-privilege roles, migration drift detection, and destructive migration review.
6. Build the first operator visibility screens for jobs, dead letters, notifications, incidents, and runbooks.
7. Add payment reconciliation, chargeback handling, notification receipts, and provider failure dashboards.
8. Standardize domain services, lifecycle states, and persistent domain event outbox coverage for critical modules.
9. Build the domain maturity matrix into execution: retire remaining mock/prototype paths and prove launch readiness module by module.
10. Deploy the private agent service plus dedicated worker, then add AI safety evals, tool-permission red-team tests, token budgets, and AI incident response.
11. Productize BI executor, exports, scheduled reports, and export policy enforcement.
12. Retire generated/stale files, add ignore rules, and formalize generated-file lifecycle rules.
13. Prepare release governance, pilot/UAT gates, support escalation, accessibility checks, procurement evidence, and commercial packaging.
14. Run first controlled pilot using the defined scope, migration plan, UAT signoffs, training rollout, and hypercare model.
15. Run performance, backup/restore, incident, accessibility, AI-eval, procurement, and compliance drills before broad external launch.
16. Keep the roadmap current through the source-of-truth and decision-log process after every shipped milestone.

## Tracking Checklist

- [x] Security hardening committed and deployed.
- [x] Production env contract expanded for production app URL, tenant hosts, payment secrets, required notification providers, cron, storage/CDN, backup retention, restore-drill warnings, agent readiness, and error-tracking gaps.
- [ ] Strict infra check passing with real Vercel/Neon production secrets.
- [x] Vercel Cron route declared for `/api/jobs/dispatch`.
- [ ] `CRON_SECRET` configured in Vercel and first production cron dispatch observed.
- [x] High-severity audit gate in CI.
- [x] Push/PR E2E smoke gate stabilized and passing in GitHub Actions.
- [x] Broad product roadmap execution tracks adopted.
- [ ] Low/moderate dependency findings classified.
- [ ] Route-boundary contract tests added.
- [ ] Payment webhook fixture tests added.
- [ ] Vercel Cron or external scheduler configured, deployed, and observed dispatching jobs.
- [ ] Operator console UI started.
- [ ] Job/dead-letter and notification dashboards available.
- [ ] Alert routing configured.
- [ ] Backup restore drill completed.
- [ ] Private agent service and worker deployed.
- [ ] BI executor implemented.
- [ ] Legacy mock/prototype paths retired or feature-flagged.
- [ ] Generated `graphify-out` artifacts removed or relocated.
- [ ] Duplicate audit snapshots consolidated under `audits/reports/`.
- [ ] Root/package-manager lockfile policy cleaned up.
- [ ] Generated backend `bin` output removed or justified.
- [ ] Stale roadmap/security docs updated, archived, or marked historical.
- [ ] Launch smoke suite and runbooks completed.
- [ ] CI/CD enforcement gates added: audit, required checks, secret scanning, branch protection, PR/release templates, and evidence capture.
- [ ] Security headers and CSP hardening plan completed, including CSP exception review, CSRF/origin controls, DAST, WAF, and rate-limit policy.
- [ ] Domain maturity matrix reviewed and launch readiness tracked for Admissions, Attendance, Exams, Fees, Timetable, Transport, HR, Library, Parent Portal, AI, BI, and Operator Console.
- [ ] Core domain eventing roadmap adopted for domain services, lifecycle states, event outbox, replay, and module coverage.
- [ ] RLS and database security deepening completed: policy matrix, real Postgres tests, DB role least privilege, drift detection, destructive migration review, connection limits, backup encryption ownership, and tenant fixtures.
- [ ] AI evaluation and safety suite added for prompt injection, grounding, hallucination, tenant leakage, tool permissions, cost budgets, fallback behavior, incident response, and eval evidence.
- [ ] Standards and interoperability matrix documented for LTI, OneRoster/SIF/Ed-Fi, SAML/OIDC/SCIM, Open Badges, CLR, xAPI/Caliper, HECVAT, WCAG, PCI-aware controls, and AI risk mapping.
- [ ] Release governance documented: release train, versioning/labels, changelog, feature-flag lifecycle, rollback, canary, customer notes, status page, and post-release review.
- [ ] Pilot and UAT governance documented with pilot size, imported data, workflows proven, success metrics, duration, signoff owners, customization limits, training, escalation, and go/no-go gates.
- [ ] Procurement evidence room prepared with security, privacy, AI governance, accessibility, subprocessors, deployment matrix, shared responsibility, SLA, DPA, MSA, retention policy, and questionnaire pack.
- [ ] Accessibility operating model implemented with WCAG target, keyboard and screen-reader testing, CI checks, VPAT ownership, media rules, remediation SLAs, and no critical Tier 1 blockers.
- [ ] Support and customer success operating model prepared with support tiers, response SLAs, escalation matrix, onboarding, training, help center, release notes, customer health, renewal signals, feedback intake, and incident templates.
- [ ] Commercial packaging and margin model defined for Core SIS, AI Pack, Payments Pack, Trust Pack, International Pack, implementation services, AI metering, provider fees, infrastructure cost, gross margin, and expansion packaging.
- [ ] Generated file lifecycle policy applied for screenshots, Playwright reports, migration dry runs, customer imports, exports, audit JSON, logs, `.tsbuildinfo`, `.codex/`, `.npm-cache/`, graph outputs, temporary scripts, and backend `bin` output.
- [ ] Source-of-truth and decision-log process adopted with roadmap ownership, update cadence, completed-item policy, archival rules, PRD-to-roadmap flow, evidence requirements, and conflict-resolution order.
