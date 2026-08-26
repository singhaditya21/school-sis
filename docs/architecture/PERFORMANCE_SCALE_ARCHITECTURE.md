# Performance & Scale Architecture

This slice establishes the first production performance contract for School SIS: shared rate limiting, query/index hygiene, private caching rules, bundle budgets, and a repeatable load-test harness.

## Runtime Rate Limiting

Login brute-force protection now uses this backend order:

1. Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present.
2. Postgres `rate_limit_buckets` as the production fallback.
3. In-memory maps only for local development and unit tests.

The Postgres table is RLS-protected and only accessible through platform bypass context. This prevents serverless/worker instances from silently relying on per-process memory.

Recommended production env:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

If Upstash is not available, no extra env is required; the app falls back to the shared Postgres bucket table.

## Query And Index Audit

Migration `0010_performance_scale_architecture.sql` adds indexes for the highest-traffic tenant paths:

- Students by tenant, status, grade, section, and admission number.
- Guardians by tenant/student/primary and tenant/user.
- Invoices by tenant/status/due date and tenant/student/status.
- Payments by tenant/status/paid date, tenant/invoice, and tenant/student/paid date.
- Attendance by tenant/date/status, tenant/student/date, and tenant/section/date.

The fee cashflow service was changed from a correlated monthly invoice subquery to separate invoice/payment rollups joined by month. Joins now include tenant equality on student, section, and grade references.

## Caching Strategy

Tenant-sensitive application data remains `private` or `no-store`; shared static assets can be cached aggressively.

Cache profiles live in:

```text
apps/web/src/lib/performance/cache.ts
```

Static asset headers are configured in:

```text
apps/web/next.config.ts
```

Rules:

- Use `noStore` for auth, payment, parent, and mutation responses.
- Use `tenantDashboard` only for short-lived tenant-scoped dashboards.
- Use `tenantReference` for low-churn tenant reference data.
- Use `publicStatic` only for public, non-sensitive assets.

## Bundle Budgets

Run after `pnpm build`:

```bash
pnpm perf:bundle
```

Config:

```env
BUNDLE_MAX_TOTAL_KB=10000
BUNDLE_MAX_ROUTE_KB=2500
```

The script reads `.next` manifests, writes `.next/bundle-analysis.json`, reports the heaviest routes/chunks, and fails when budgets are exceeded.

## Load Testing

Run a local smoke load:

```bash
LOAD_TEST_BASE_URL=http://localhost:3000 pnpm perf:load
```

Dry-run config validation:

```bash
pnpm --filter @school-sis/web run perf:load -- --dry-run
```

Config:

```env
LOAD_TEST_BASE_URL=http://localhost:3000
LOAD_TEST_DURATION_SECONDS=15
LOAD_TEST_CONCURRENCY=5
LOAD_TEST_PATHS=/api/health,/login
LOAD_TEST_MAX_ERROR_RATE=0.05
LOAD_TEST_MAX_P95_MS=1500
```

Do not run high-concurrency tests against production without an explicit maintenance window and monitoring.

## Release Gate

Before a performance-sensitive release:

```bash
pnpm test:unit
pnpm build
pnpm perf:bundle
pnpm --filter @school-sis/web run perf:load -- --dry-run
```

Apply migration `0010_performance_scale_architecture.sql` before deploying app code that uses the Postgres rate-limit fallback.
