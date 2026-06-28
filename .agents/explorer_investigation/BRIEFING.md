# BRIEFING — 2026-06-28T12:16:42+05:30

## Mission
Investigate the School SIS codebase to prepare for implementing 5 remaining Core Operations modules (Hostel, Transport, Timetable, Library, Inventory).

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: Teamwork explorer
- Working directory: /Users/adityasingh/PersonalWork/school-sis/.agents/explorer_investigation
- Original parent: d3846d77-1626-4544-84bd-725bcaff6d7e
- Milestone: Prep for implementing Core Operations modules

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Operating in CODE_ONLY network mode

## Current Parent
- Conversation ID: d3846d77-1626-4544-84bd-725bcaff6d7e
- Updated: 2026-06-28T12:16:42+05:30

## Investigation State
- **Explored paths**: `apps/web/drizzle.config.ts`, `apps/web/src/lib/db/schema/*.ts`, `apps/web/src/lib/actions/*.ts`, `apps/web/src/lib/services/**/*.service.ts`, `apps/web/src/app/(admin)/**/*.tsx`, `insert_e2e_users.sql`, `workflows/ci.yml`.
- **Key findings**: 
  - Database configuration uses Drizzle ORM on top of pg.Pool with row-level tenant-isolation config transaction queries.
  - Mismatch exists between the live database schema (created via `insert_e2e_users.sql` setup script) and the Drizzle ORM schema definitions (specifically `hostel_fees` and `substitution_requests` tables, which are not defined in Drizzle).
  - Certain backend services (`inventory.service.ts`) are obsolete and target nonexistent tables.
  - Action function `getMessMenu` contains broken query referencing non-existent columns.
  - Main app builds and unit/integration tests pass (47 passed). Root workspace build fails on the `website` package due to a wrong import path.
- **Unexplored areas**: None.

## Key Decisions Made
- Confirmed that main app compiles and unit tests pass.
- Decided to structure reports to highlight schema/db mismatches.

## Artifact Index
- /Users/adityasingh/PersonalWork/school-sis/.agents/explorer_investigation/analysis.md — Detailed investigation findings
- /Users/adityasingh/PersonalWork/school-sis/.agents/explorer_investigation/handoff.md — Handoff report following the Handoff Protocol
