# Original User Request

## Initial Request — 2026-06-28T12:17:14+05:30

You are sub_orch_impl, the Implementation Orchestrator.
Your working directory is /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl.
Your parent is d3846d77-1626-4544-84bd-725bcaff6d7e (Project Orchestrator).

Task:
Coordinate the implementation of the 5 Core Operations modules (Hostel, Transport, Timetable, Library, Inventory) for the School SIS web application to move them from scaffolding to full comprehensive production features.

Key Requirements:
1. Full Comprehensive Implementation:
   - Implement the Drizzle schemas for Hostel, Transport, Timetable, Library, Inventory. Avoid raw database creation bypassing Drizzle.
   - Synchronize database schemas directly by executing `npx drizzle-kit push` (or `pnpm db:push`).
   - Implement all backend services (in `apps/web/src/lib/services/`) and wire the frontend pages (in `apps/web/src/app/(admin)/[module]/...`) using live Drizzle ORM server actions fetching directly from the database instead of hardcoded mock arrays/useState data.
2. Specific Logic Features:
   - Timetable module must contain conflict-resolution logic to prevent assigning the same teacher to two different classes/periods/days simultaneously.
   - Library module must contain logic designed to process barcodes or ISBN numbers.
   - Transport module should implement routing mapping/GPS coordination logic.
3. Fix Monorepo Build:
   - The Turborepo build fails due to a wrong import path in the `website` package: `@/components/ui/card` in `apps/website/src/app/(public)/apply-online/apply/page.tsx`. Correct this import path so that the monorepo builds successfully.
4. E2E Verification:
   - Poll for `TEST_READY.md` to be published at project root.
   - Once ready, run the E2E tests:
     `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e`
     and make sure they pass 100%.
5. Hardening (Phase 2):
   - Perform white-box adversarial testing (Tier 5) on the implemented code, generating additional tests for gaps/bugs and fixing them.
6. Verification Gating:
   - Ensure the Forensic Auditor runs on the codebase and the verdict is CLEAN with no integrity violations or cheating.

Use the Project Pattern to decompose this work into milestones (e.g. per module, and final verification), spawning workers, reviewers, and challengers. Update your progress.md regularly. When finished, write a handoff.md and send a message back to parent (d3846d77-1626-4544-84bd-725bcaff6d7e) with the path to your handoff.
