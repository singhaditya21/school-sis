# ScholarMind

ScholarMind is a multi-tenant student information system for education groups. The current release focuses on trustworthy K-12 administration workflows, tenant isolation, payments, approvals, and operational readiness.

The repository is under active product hardening. Features that are incomplete, depend on an unconfigured provider, or have not passed their release gate are hidden or reported as unavailable; they must not present demo data as live institutional data.

## Current architecture

- **Product application:** Next.js 16 and React 19 in `apps/web`
- **Marketing website:** Next.js in `apps/website`
- **Mobile client:** Expo prototype in `apps/mobile` (not production-enabled)
- **Database:** PostgreSQL 16 with pgvector and Drizzle ORM
- **Shared domain package:** schemas, authorization, services, workflows, and analytics in `packages/api`
- **Local scheduler:** `scripts/scheduler.mjs`

The supported runtime is currently local-first. There is no production cloud deployment committed in this repository yet. See [RUNNING.md](./RUNNING.md) for the exact setup and [docs/ISSUES_AND_ROADMAP.md](./docs/ISSUES_AND_ROADMAP.md) for verified readiness status.

## Implemented foundations

- Central page and API access policies
- Tenant-scoped database context and row-level security verification
- Payment ledger, webhook idempotency, refunds, and approval controls
- Durable jobs, notification outbox, retries, and dead-letter handling
- Admissions, attendance, exams, fees, timetable, reporting, and portal surfaces at varying readiness levels

AI, mobile, higher-education, international, coaching, compliance, and provider-specific capabilities are released only after their individual readiness gates pass. The historical 26-agent architecture is product direction, not an active runtime service in the current tree.

## Run locally

Prerequisites:

- Node.js 20+
- pnpm 9.15.9 through Corepack
- PostgreSQL 16 with pgvector

```bash
corepack enable
pnpm install
pnpm local:setup
pnpm dev
```

For manual database lifecycle commands and environment details, use [RUNNING.md](./RUNNING.md) and [docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md).

## Validation

```bash
pnpm build
pnpm lint
pnpm test:unit
pnpm test:architecture
pnpm audit:ci
pnpm test:e2e:smoke
```

The full Playwright suite is broader than the smoke gate and is currently run separately while its scheduled coverage is stabilized.

## Product and engineering references

- [Issues and roadmap](./docs/ISSUES_AND_ROADMAP.md)
- [Product truth and 24-month roadmap](./docs/PRODUCT_TRUTH_AND_ROADMAP.md)
- [Identity architecture](./docs/IDENTITY_ARCHITECTURE.md)
- [Core SIS domain architecture](./docs/CORE_SIS_DOMAIN_ARCHITECTURE.md)
- [Payments and billing](./docs/PAYMENTS_BILLING_ARCHITECTURE.md)
- [Background jobs and notifications](./docs/BACKGROUND_JOBS_NOTIFICATIONS_ARCHITECTURE.md)
- [Testing and quality](./docs/TESTING_QUALITY_ARCHITECTURE.md)
- [API guide](./docs/api/README.md)

Claims about availability, compliance certification, provider support, AI behavior, or deployment topology require linked operational evidence before they are exposed publicly.
