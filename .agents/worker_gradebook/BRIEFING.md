# BRIEFING — 2026-06-27T14:45:25Z

## Mission
Migrate and secure the Gradebook Module, enforcing tenant isolation, registering permissions, and converting the legacy teacher gradebook UI page to use shadcn Table and Badge components.

## 🔒 My Identity
- Archetype: Gradebook Module Migrator
- Roles: implementer, qa, specialist
- Working directory: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_gradebook
- Original parent: 7b34db06-8464-463d-9cb0-758e8319cf22
- Milestone: TBD

## 🔒 Key Constraints
- Use parameterized pool.query from @/lib/db
- Enforce tenant isolation
- Implement getGradebookData(classId?: string) returning classes, exams, students
- Enforce auth using requireAuth('gradebook:read') from @/lib/auth/middleware
- Register permissions gradebook:read and gradebook:write, assigning them to roles (like TEACHER and SCHOOL_ADMIN)
- In apps/web/src/app/teacher/gradebook/page.tsx, replace HTML tables with shadcn Table components & Badge components
- No hardcoded test results, facade implementations, or cheating

## Current Parent
- Conversation ID: 7b34db06-8464-463d-9cb0-758e8319cf22
- Updated: not yet

## Task Summary
- **What to build**: gradebook service, permissions, updated page.tsx UI components.
- **Success criteria**: Genuine implementation passing build/compile checks, tenant-isolated DB queries, authorized correctly.
- **Interface contracts**: getGradebookData signature, permissions structure.
- **Code layout**: apps/web/src/lib/services/gradebook/gradebook.service.ts, apps/web/src/lib/rbac/permissions.ts, apps/web/src/app/teacher/gradebook/page.tsx

## Key Decisions Made
- Initializing briefing and progress trackers.

## Artifact Index
- None
