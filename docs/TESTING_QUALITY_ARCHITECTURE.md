# Testing & Quality Architecture

School SIS uses a layered quality model that keeps fast checks cheap while reserving full browser/database runs for integration confidence.

## Test Layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Architecture contract | `pnpm test:architecture` | Verifies required test harness files, scripts, and generated-file hygiene. |
| Unit regression | `pnpm test:unit` | Runs Jest tests for validation, tenant isolation, storage safety, DB context, and observability primitives. |
| Unit coverage | `pnpm test:unit:coverage` | Produces text, lcov, and JSON summary coverage artifacts. |
| E2E smoke | `pnpm test:e2e:smoke` | Runs the smallest Playwright path against a real Next.js server and isolated Postgres database. |
| Full E2E | `pnpm test:e2e` | Runs Playwright suites against a generated test database. |

## Quality Gates

- Every pull request runs infrastructure validation, Drizzle migration validation, TypeScript, build, lint, architecture contract checks, and unit tests.
- Playwright runs use generated `.env.test` files and generated Postgres databases. These files are runtime artifacts and must not be committed.
- E2E database names are sanitized before use as SQL identifiers.
- Test databases are dropped during teardown by default. Set `SCHOOL_SIS_KEEP_TEST_DB=true` only when debugging locally.
- Networked third-party providers remain mock-first in tests. Provider cutover tests should use local fakes or signed fixture payloads, not live payments or messages.

## Critical Regression Coverage

The current foundation coverage protects:

- Tenant ID validation, tenant field rejection, tenant-scoped JSON parsing, job payload construction, and tenant-scoped file retrieval.
- R2 object key generation, traversal rejection, cross-tenant key rejection, and tenant metadata on uploads.
- Async database tenant context and RLS bypass context restoration.
- Structured observability logging, request/trace correlation, and metadata redaction.

## Expansion Path

Next coverage should be added in this order:

1. Payment webhook idempotency and signature verification tests.
2. RLS migration regression tests against a real Postgres database.
3. API contract tests for public/private route boundaries.
4. Role and MFA enforcement tests for privileged routes.
5. Playwright critical path: login -> invoice payment -> receipt download.
6. Load tests for background job dispatch, notification outbox, and agent approval queues.
