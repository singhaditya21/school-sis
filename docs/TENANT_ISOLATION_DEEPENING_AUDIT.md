# Tenant Isolation Deepening Audit

Date: 2026-06-30

## Scope

Audited tenant isolation across:

- `apps/web/src/app/api/**/route.ts`
- `apps/web/src/lib/actions/**/*.ts`
- `apps/web/src/app/**/page.tsx` server-side DB callers
- `packages/api/src/services/**/*.ts`
- `packages/api/src/db/schema/**/*.ts`
- tenant-scoped upload and file retrieval paths

## Controls Implemented

- Shared `pg.Pool` now applies request-local RLS context to every acquired connection.
- Authenticated sessions enter either tenant context or explicit platform bypass context.
- Bootstrap flows that must run before tenant context exists now use explicit RLS bypass:
  - password login
  - OAuth tenant-domain lookup
  - password reset
  - school onboarding/provisioning
  - seed and force-migration endpoints
  - public marketing lead capture
- Signed service routes now enter scoped context:
  - IoT ingest uses verified service auth plus tenant header match before DB writes.
  - Stripe invoice webhooks require tenant metadata and update invoice/payment rows inside tenant context.
  - Stripe company/subscription webhooks run in explicit platform bypass context.
- Database-level RLS migration added at `packages/api/src/db/migrations/tenant-rls.sql`.
- RLS apply script added as `pnpm --filter @school-sis/web db:rls`.
- File retrieval now validates tenant-prefixed keys and returns short-lived signed S3/R2 URLs.

## RLS Coverage

The RLS migration covers:

- Every public table with a `tenant_id` column.
- Core cross-tenant parent tables:
  - `tenants`
  - `companies`
- Tenant-child tables without their own `tenant_id`:
  - `grade_subjects`
  - `fee_components`
  - `exam_schedules`
  - `stops`
  - `webhook_deliveries`
  - `grading_rubrics`
  - metadata fields/layouts/permissions/values
- Global-but-tenant-readable tables:
  - `hq_groups`
  - `group_policies`
  - `platform_broadcasts`
- Platform-only sensitive tables:
  - `platform_audit_logs`
  - `marketing_leads`
- Conditional runtime tables:
  - `password_reset_tokens`, if present

## Older Module Audit Result

Older modules still using direct `pool.query`, `pool.connect`, or Drizzle `db.execute` are now protected by the shared DB context layer once they run after `getSession`, `requireAuth`, or `requireApiAuth`.

Modules that intentionally operate outside tenant context were converted to explicit platform/RLS bypasses rather than relying on unrestricted database access.

## Operational Rules

- Apply schema first, then apply RLS with `db:rls`.
- Background jobs must call `runWithTenantContext(tenantId, fn)` before tenant data access.
- Platform jobs and schema maintenance must call `runWithRlsBypass(fn)` or set `app.bypass_rls = on`.
- New file storage keys must continue using `createTenantStorageKey`.
- New file reads must go through `/api/files/...` or validate keys with `validateTenantStorageKey`.

## Watchlist

- `platform_plugins` is an ad hoc global table created from the AppExchange page and is not part of the Drizzle schema. It does not contain tenant data today, but it should be moved into schema-managed migrations before plugin install state becomes tenant-specific.
- Any future standalone worker that imports `@school-sis/api` outside Next.js must set tenant context explicitly before using `pool` or `db`.
