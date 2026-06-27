# BRIEFING — 2026-06-27T21:20:00Z

## Mission
Fix Next.js compilation issues, resolve E2E database connection pooling leaks, align RBAC permissions, and ensure all 60 E2E tests pass successfully on the production server build.

## 🔒 My Identity
- Archetype: worker_e2e_builder_gen3
- Roles: implementer, qa, specialist
- Working directory: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_e2e_builder_gen3
- Original parent: 6c5ea5a0-03b9-4c0b-ad91-71a1d5b68b38
- Milestone: Fix NextJS builds and E2E verification

## 🔒 Key Constraints
- CODE_ONLY network mode: no external HTTP clients allowed.
- Minimal change principle: do not perform unrelated refactoring.
- Secure database interaction without leaking client connections.

## Current Parent
- Conversation ID: 6c5ea5a0-03b9-4c0b-ad91-71a1d5b68b38
- Updated: not yet

## Task Summary
- **What to build**: Next.js service interface/type refactoring, E2E DB connection leak mitigation, RBAC permissions realignment, and client component backend wiring.
- **Success criteria**: Clean compilation build, zero lint/build errors, and 60/60 E2E tests passing.
- **Interface contracts**: apps/web/src/lib/services/library/types.ts, apps/web/src/lib/services/hostel/types.ts

## Key Decisions Made
- Replaced pg connection leaks in E2E spec by using dynamic single-connection Pool instances inside a helper query executor.
- Realigned role permissions: granted `diary:read` and `appointments:read` permissions to TEACHER and PARENT roles.
- Switched Playwright server manager to use `pnpm run start` (production server) with `timeout: 120000` to prevent dev mode compiling latency and bcrypt CPU delays.
- Refactored `createSubstitutionRequest` inside `src/lib/actions/timetable.ts` to be fully database-backed, replacing the empty mock.

## Change Tracker
- **Files modified**:
  - `apps/web/src/lib/services/library/library.service.ts` — Refactored to async function exports.
  - `apps/web/src/lib/services/library/types.ts` — Created types export file.
  - `apps/web/src/lib/services/hostel/hostel.service.ts` — Refactored to async function exports.
  - `apps/web/src/lib/services/hostel/types.ts` — Created types export file.
  - `apps/web/src/lib/rbac/permissions.ts` — Updated role definitions.
  - `apps/web/src/middleware.ts` — Added teacher route protection.
  - `apps/web/src/lib/actions/timetable.ts` — Added database-backed create action.
  - `apps/web/src/app/(admin)/timetable/substitution/page.tsx` — Wired UI form to database.
  - `apps/web/e2e/migrated-modules.spec.ts` — Cleaned strict mode locators and delays.
- **Build status**: PASS
- **Pending issues**: None

## Quality Status
- **Build/test result**: 60 passed, 0 failed
- **Lint status**: 0 style violations
- **Tests added/modified**: Modified E2E test helper methods to wait for network/idle and avoid strict mode violations.
