# BRIEFING — 2026-06-27T20:41:40Z

## Mission
Resume and complete the Library module migration from where the previous agent stopped, ensuring tenant isolation, proper auth check, compilation, and tests pass.

## 🔒 My Identity
- Archetype: Library Module Migrator (Replacement)
- Roles: implementer, qa, specialist
- Working directory: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_library_replacement
- Original parent: 7b34db06-8464-463d-9cb0-758e8319cf22
- Milestone: Complete Library module migration

## 🔒 Key Constraints
- Parameterized pool.query enforcing tenant isolation
- requireAuth('library:read')
- getLibraryStudents(): Promise<any[]>
- getLibraryHistory(): Promise<any[]>
- shadcn Table and Badge components in UI pages

## Current Parent
- Conversation ID: 7b34db06-8464-463d-9cb0-758e8319cf22
- Updated: 2026-06-27T20:41:40Z

## Task Summary
- **What to build**: Inspect, complete, and fix the Library module migration. Verify tenant isolation, permissions, UI components, compile, and run tests.
- **Success criteria**: Code compiles, tests pass, correct permissions, correct pages, tenant isolation enforced.
- **Interface contracts**: apps/web/src/lib/services/library/library.service.ts
- **Code layout**: apps/web/src/lib/services/library/library.service.ts, apps/web/src/lib/rbac/permissions.ts, apps/web/src/app/(admin)/library/issue/page.tsx, apps/web/src/app/(admin)/library/history/page.tsx

## Key Decisions Made
- Updated `getLibraryStudents` SQL to COALESCE student `user_id` with the primary guardian's `user_id` as fallback, which avoids database constraint violations during `issueBook`.
- Joined `sections` and `grades` in `getLibraryHistory` query to retrieve the student's class name dynamically for display in the return table.
- Connected the mock buttons in `IssueBookPage` to execute actual server actions `issueBook` and `returnBook`.

## Artifact Index
- /Users/adityasingh/PersonalWork/school-sis/.agents/worker_library_replacement/handoff.md — Handoff Report
