# ScholarMind

A multi-tenant School Information System (SIS) for K-12 school groups: fees and payments,
admissions, attendance, exams, timetable, library, HR, transport, hostel, and parent/student
portals — with per-tenant isolation enforced in the database.

Production runs on **Vercel** (app) and **Neon** (Postgres). See
[docs/devops/README.md](./docs/devops/README.md) for the release pipeline, and
[RUNNING.md](./RUNNING.md) to run it locally.

---

## Architecture

A pnpm + Turborepo monorepo. Everything is TypeScript; there are no other language services.

| Workspace | What it is |
|---|---|
| `apps/web` | The product. Next.js 16 (App Router), server actions, Tailwind + Tremor dashboards. |
| `apps/website` | The public marketing site. Separate deploy so marketing changes cannot break the product. |
| `apps/mobile` | Expo/React Native client. Not production-ready — see the roadmap. |
| `packages/api` | Shared domain layer: Drizzle schema, services, authorization policy, workflows. |

**Data**: PostgreSQL 16 with `pgvector`, accessed through Drizzle ORM plus hand-written SQL.
Schema lives in `packages/api/src/db/schema/`; migrations in `apps/web/drizzle/`.

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

**AI**: an in-app copilot (`apps/web/src/app/api/copilot/route.ts`, `apps/web/src/lib/agents/`)
providing bounded, human-in-the-loop decision support. It does not act autonomously. Claims
about AI capability on the public site are gated by `pnpm audit:claims` — see
[docs/sales/README.md](./docs/sales/README.md) for the approved-claims register.

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
(`pnpm audit:claims`), migration safety, and the RLS policy matrix. CI runs the same set plus
typecheck, build, lint, unit tests, and a Playwright smoke suite. Only the smoke suite gates
pull requests; the full e2e suite is manual (`workflow_dispatch`).

---

## Documentation

- **[Running locally](./RUNNING.md)** — local Postgres, seed data, day-to-day development.
- **[DevOps & release](./docs/devops/README.md)** — the Vercel/Neon pipeline, environments, rollback. Source of truth for deployment.
- **[End-user guide](./docs/user-guide/README.md)** — for school admins and teachers.
- **[Developer & API guide](./docs/api/README.md)** — metadata engine, webhooks, integrations.
- **[Testing architecture](./docs/TESTING_QUALITY_ARCHITECTURE.md)** — test layers and what actually gates CI.
- **[Issues & roadmap](./docs/ISSUES_AND_ROADMAP.md)** — prioritized open work.
- **[Sales enablement](./docs/sales/README.md)** — positioning and the approved-claims register.
- **[GTM execution](./docs/gtm/README.md)** — pilot scope, buyer research, evidence log.

### Reference

- [Database security notes](./docs/SECURITY_REPORT.md) — RLS policies and injection testing.
- [Historical PRDs](./docs/PRDs/) — product evolution; superseded by the roadmap above.
- [Audit reports](./audits/reports/) — point-in-time application audits.
