# ScholarMind

A multi-tenant School Information System (SIS) for K-12 school groups: fees and payments,
admissions, attendance, exams, timetable, library, HR, transport, hostel, and parent/student
portals — with per-tenant isolation enforced in the database.

Production runs on **Vercel** (app) and **Neon** (Postgres).

| Surface | URL |
|---|---|
| Product app | https://school-sis-web.vercel.app |
| Marketing site | https://school-sis-website.vercel.app |
| Health check | https://school-sis-web.vercel.app/api/health |

The product root redirects to `/login`. The Vercel project name is `school-sis-web` (region `sin1`). See
[docs/operations/devops/README.md](./docs/operations/devops/README.md) for the release pipeline, and
[RUNNING.md](./RUNNING.md) to run it locally.

---

## Architecture

A pnpm + Turborepo monorepo. Everything is TypeScript; there are no other language services.

| Workspace | What it is |
|---|---|
| `apps/web` | The product. Next.js 16 (App Router), server actions, Tailwind + Tremor dashboards. |
| `apps/website` | The public marketing site. Separate deploy so marketing changes cannot break the product. |
| `apps/mobile` | Expo/React Native client. Not production-ready — see the roadmap. |
| `packages/api` | Shared domain layer: the raw-SQL data layer (a tenant-scoping query builder over generated types), services, authorization policy, workflows. |

**Data**: PostgreSQL 16 with `pgvector`, accessed through hand-written SQL — a small `` sql`` `` tagged-template helper and a tenant-scoping query builder over generated row/column types (`packages/api/src/db/generated/`). Migrations are hand-written SQL in `apps/web/drizzle/`.

**Identity**: Iron Session. Page and API authorization run off a central matrix
(`apps/web/src/lib/auth/page-access.ts`, `api-access.ts`); role permissions are defined in
`packages/api/src/authorization/` and surfaced read-only at Settings → Role Permissions.

**Tenant isolation**: Postgres row-level security is FORCEd on every table carrying a
`tenant_id`, with join-based policies for child tables that lack one. Tenant context is
carried in an HMAC-signed, transaction-scoped setting that Postgres itself verifies, so a
leaked database credential alone cannot forge a tenant. RLS bypass is a typed capability
requiring a written justification (`packages/api/src/db/rls-bypass.ts`) and routes to a
separately credentialed role. Two CI gates protect this: a static policy matrix
(`pnpm audit:rls-matrix`) and a live isolation test against a real Postgres.

**Background work**: durable Postgres-backed job queue and a transactional notification
outbox, drained via `/api/jobs/dispatch`.

**AI**: an in-app copilot (`apps/web/src/app/api/copilot/route.ts`, `apps/web/src/lib/ai/`)
providing bounded, human-in-the-loop decision support. It does not act on its own. Claims
about AI capability on the public site are gated by `pnpm audit:claims` — see
[docs/gtm/sales/README.md](./docs/gtm/sales/README.md) for the approved-claims register.

---

## Getting started

```bash
pnpm install
pnpm local:setup   # local Postgres 16 + pgvector, schema, seed data
pnpm dev           # http://localhost:3000
```

Requires **Node 24.x** and pnpm 9.15.9 (`corepack enable`). Full instructions, including the
local database lifecycle, are in [RUNNING.md](./RUNNING.md).

## Quality gates

`pnpm audit:ci` runs the full static gate set locally — dependency audit, secret scan,
repository hygiene, the risk-debt ratchet (`pnpm audit:debt`), the public-claims guard
(`pnpm audit:claims`), migration safety, and the RLS policy matrix. GitHub Actions (`ubuntu-latest`,
100% free on this public repository) runs the same set plus typecheck, build, lint, unit &
architecture tests, live Postgres RLS isolation tests, and the 19-test Playwright E2E suite on pull
requests, `main` pushes, and nightly schedules.

---

## Documentation

Full categorized index: **[docs/README.md](./docs/README.md)** (includes the **100% ₹0 / $0 Free-Tier** development & deployment stack).

- **[Running locally](./RUNNING.md)** — local Postgres, seed data, day-to-day development (`₹0`, no cloud dependencies).
- **[DevOps & release](./docs/operations/devops/README.md)** — the GitHub Free + Vercel + Neon pipeline, environments, rollback. Source of truth for deployment.
- **[Go-live & ₹0 integrations](./docs/operations/GO_LIVE_INTEGRATIONS.md)** — free-tier & production setup for WhatsApp (WAHA/Evolution/Meta), Email, Push, AI Copilot, R2, and Turnstile.
- **[LCNC platform architecture](./docs/architecture/LCNC_PLATFORM_ARCHITECTURE.md)** — custom objects, layouts, OWD sharing, flows, dashboards, portals, and `.scholarmind.json` bundles.
- **[AI Copilot architecture](./docs/architecture/AI_AGENT_ARCHITECTURE.md)** — bounded TypeScript copilot, human approvals, and free-tier LLM provider chain.
- **[End-user guide](./docs/guides/user-guide/README.md)** — for school admins and teachers.
- **[Developer & API guide](./docs/guides/api/README.md)** — metadata engine, webhooks, integrations.
- **[Testing architecture](./docs/architecture/TESTING_QUALITY_ARCHITECTURE.md)** — test layers and what actually gates CI.
- **[Issues & roadmap](./docs/product/ISSUES_AND_ROADMAP.md)** — prioritized open work.
- **[Sales enablement](./docs/gtm/sales/README.md)** — positioning and the approved-claims register.
- **[GTM execution](./docs/gtm/README.md)** — pilot scope, buyer research, evidence log.

### Reference

- [Tenant isolation audit](./docs/operations/TENANT_ISOLATION_DEEPENING_AUDIT.md) & [RLS policy matrix](./docs/architecture/RLS_POLICY_MATRIX.md) — 144-table `FORCE ROW LEVEL SECURITY` enforcement and transaction-bound HMAC context.
- [Audit reports](./docs/operations/audits/) — point-in-time application and security audits.
