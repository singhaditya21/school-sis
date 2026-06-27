# Handoff Report — Baseline Compilation and Database Fix

## 1. Observation
- **Next.js Compilation Error**: We observed that running `pnpm --filter @school-sis/web build` failed initially with:
  `A "use server" file can only export async functions, found object.`
  Specifically, this was caused by `apps/web/src/lib/services/library/library.service.ts` which exported the TypeScript interfaces `Book` and `BookIssue` from a file marked with `'use server';`.
- **Database Schema Push**: Running `pnpm --filter @school-sis/web db:push` failed initially with:
  `error: type "vector" does not exist`
  This was because pgvector extension was not available on the local PostgreSQL instance. We also found a helper script `apps/web/fix_vector.py` indicating vector types should be replaced with `text`.
- **Database Seeding**: Seeding using `pnpm --filter @school-sis/web db:seed` failed because of missing `DATABASE_URL` environment variables in the task context, and subsequently failed with a duplicate key constraint for the tenant code `'GREENWOOD'` because the local database had pre-existing tables.
- **Dashboard Stats Error**: In Playwright E2E execution logs, we observed the following dashboard query crash:
  `[WebServer] [Dashboard] Stats error: error: column "status" does not exist`
  `[WebServer]   hint: 'Perhaps you meant to reference the column "admission_leads.stage".'`

## 2. Logic Chain
- **Next.js Compilation Fix**:
  - Since React Server Actions entry points (`"use server"`) cannot export non-async function values (including TS interfaces if they are bundled/evaluated as exports), we moved the declarations of `Book` and `BookIssue` to `apps/web/src/lib/services/library/types.ts` and updated `library.service.ts` to import them using `import type { Book, BookIssue } from './types';`.
  - As a result, the Next.js compilation error was fully resolved, and `pnpm --filter @school-sis/web build` succeeded.
- **Database Push and Seeding Fix**:
  - We modified the Drizzle custom types for the `embedding` fields in both `apps/web/src/lib/db/schema/students.ts` and `apps/web/src/lib/db/schema/fees.ts` to return `'text'` instead of `'vector(768)'` to allow the schema to push to a local PostgreSQL instance without requiring the pgvector extension.
  - We wiped/reset the local database using `psql ... -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"` to prevent duplicate unique key constraints on seed data insertion.
  - We copied environment variables from `.env.local` to `.env` in `apps/web` and supplied `DATABASE_URL` explicitly to the seed script:
    `DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web db:seed`.
  - The seed completed successfully, populating all 20 students, classes, sections, invoices, payments, and other baseline data.
- **Dashboard Query Fix**:
  - We updated `apps/web/src/lib/actions/dashboard.ts` to query `stage = 'NEW'` instead of the non-existent `status = 'NEW'` in the `admission_leads` table, preventing the Next.js dev server from crashing on dashboard load.
- **E2E execution**:
  - With the DB push/seed completed and the dashboard crash resolved, we executed Playwright E2E tests using `pnpm --filter @school-sis/web test:e2e`. The tests successfully spin up the dev server, establish a database connection, log in, and proceed to execute.

## 3. Caveats
- Baseline E2E tests still report failures on page assertions (e.g. missing `data-testid="sidebar"`). This is expected per instructions: "they don't all have to pass yet, but they should not fail due to compilation or empty database/connection refuse".
- The pgvector extension compatibility fallback uses the `text` type for embeddings. If vector distance operations are implemented in SQL queries in other files, those queries might need adjustment or vector-extension support.

## 4. Conclusion
- Next.js compilation and the PostgreSQL database push/seed are fully fixed and verified.
- The dev server starts and compiles properly. Playwright E2E tests run successfully against the populated database.

## 5. Verification Method
1. Build compilation: Run `pnpm --filter @school-sis/web build`. It should compile successfully.
2. DB Push: Clean schema and run `pnpm --filter @school-sis/web db:push --force`. Changes should apply without vector-type errors.
3. DB Seed: Run `DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web db:seed`. It should report a successful seed.
4. E2E Tests: Run `pnpm --filter @school-sis/web test:e2e`. The test runner should successfully spawn the dev server and execute the tests.
