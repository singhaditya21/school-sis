# Scope: sub_orch_impl_gen3 Implementation Milestone Scope

## Architecture
- **SaaS Architecture**: Multi-tenant SIS where tenants are isolated by `tenant_id` at the database level.
- **ORM / Database**: Drizzle ORM mapping to a local PostgreSQL instance.
- **Backend**: Next.js Server Actions and Services under `apps/web/src/lib/actions` and `apps/web/src/lib/services`.
- **Frontend Pages**: Next.js App Router server and client components in `apps/web/src/app/`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Daily Utilities Drizzle Schema | Create `schema/diary.ts` defining `diary_entries` and `appointments` tables. Export schema in `index.ts`. Synchronize with DB using `drizzle-kit push`. | None | IN_PROGRESS (Conv ID: 834f49bb-af0e-44b4-9463-7985873cc662) |
| M2 | Financial & Treasury Fixes | Add tenant isolation to `getTreasurySummaryAction`. Fix Tally voucher route SQL column query. Wire `/treasury` ledgers, exceptions list, and `/integrations/tally` export client component. | M1 | IN_PROGRESS (Conv ID: 834f49bb-af0e-44b4-9463-7985873cc662) |
| M3 | HQ & Multi-Tenant Fixes | Fix `updated_at` query, casing, and activeModules types in HQ actions and UI (`/hq` and `/platform`). Wire settings config parameters, tenant list (impersonation, suspension), platform broadcasts, and leads tracking to backend database. | M1 | IN_PROGRESS (Conv ID: 834f49bb-af0e-44b4-9463-7985873cc662) |
| M4 | Advanced Analytics Wiring | Wire `/analytics` metrics (attendance, grades, low stock) and `/calendar` academic events. | M1 | IN_PROGRESS (Conv ID: 834f49bb-af0e-44b4-9463-7985873cc662) |
| M5 | Student Success Fixes | Fix `updated_at` queries in higher ed, alumni, and database schema mappings. Implement `/international` student operations (visas, host families, placements) and wire `/university`, `/alumni` tracking, and `/international` pages. | M1 | IN_PROGRESS (Conv ID: 834f49bb-af0e-44b4-9463-7985873cc662) |
| M6 | Daily Utilities Wiring | Wire `/documents` (verify checklist status changes) and `/diary` (homework logs) to database. | M1 | IN_PROGRESS (Conv ID: 834f49bb-af0e-44b4-9463-7985873cc662) |
| M7 | Integration & Verification | Run builds (`npm run build`), pass all 120 E2E tests, and run Forensic Auditor. | M1, M2, M3, M4, M5, M6 | PLANNED |

## Code Layout
- DB Schemas: `apps/web/src/lib/db/schema/`
- Server Actions & Services: `apps/web/src/lib/actions/`, `apps/web/src/lib/services/`
- Frontend UI Components & Pages: `apps/web/src/app/`
