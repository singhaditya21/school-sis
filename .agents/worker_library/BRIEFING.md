# BRIEFING — 2026-06-27T20:38:00Z

## Mission
Migrate the Library module to use a centralized library service, register library RBAC permissions, and refactor the library issue and history frontend pages to use shadcn UI Table/Badge components.

## 🔒 My Identity
- Archetype: Library Module Migrator
- Roles: implementer, qa, specialist
- Working directory: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_library
- Original parent: 7b34db06-8464-463d-9cb0-758e8319cf22
- Milestone: library-migration

## 🔒 Key Constraints
- CODE_ONLY network mode: no external network/HTTP client requests.
- Use parameterized pool.query and enforce tenant isolation in library service.
- Call requireAuth('library:read') from @/lib/auth/middleware.
- Register permissions in apps/web/src/lib/rbac/permissions.ts.
- Refactor apps/web/src/app/(admin)/library/issue/page.tsx and apps/web/src/app/(admin)/library/history/page.tsx.

## Current Parent
- Conversation ID: 7b34db06-8464-463d-9cb0-758e8319cf22
- Updated: 2026-06-27T20:38:00Z

## Task Summary
- **What to build**: Centralized library service (`apps/web/src/lib/services/library/library.service.ts`), RBAC registration, page refactoring (using shadcn table and badge, calling service functions).
- **Success criteria**: Code compiles, clean build/tests, proper RBAC permission checking and tenant isolation.
- **Interface contracts**: `getLibraryStudents(): Promise<any[]>` and `getLibraryHistory(): Promise<any[]>`
- **Code layout**: apps/web

## Key Decisions Made
- Centralized student query and history query in `library.service.ts` using `pool.query`.
- Enforced tenant isolation by passing `tenantId` from `requireAuth` to the database queries.
- Restored `db` export in `apps/web/src/lib/db/index.ts` via drizzle node-postgres and pool connection to keep existing services compiling.
- Removed `LibraryService` object export to comply with Next.js Server Action constraints (only export async functions).

## Change Tracker
- **Files modified**:
  - `apps/web/src/lib/rbac/permissions.ts` — registered library permissions.
  - `apps/web/src/lib/services/library/library.service.ts` — created new service with `getLibraryStudents` and `getLibraryHistory`.
  - `apps/web/src/app/(admin)/library/issue/page.tsx` — refactored to use new service and shadcn Table.
  - `apps/web/src/app/(admin)/library/history/page.tsx` — refactored to use new service and shadcn Table.
  - `apps/web/src/lib/db/index.ts` — restored `db` export via drizzle-orm/node-postgres.
- **Build status**: Pass
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass
- **Lint status**: 0 violations
- **Tests added/modified**: Added `apps/web/src/__tests__/library-service.test.ts` with 4 unit tests covering `getLibraryStudents` and `getLibraryHistory`.

## Artifact Index
- [TBD]
