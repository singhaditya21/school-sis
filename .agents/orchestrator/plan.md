# Project Plan: School SIS Phase 4 Remaining Scaffolding Implementation

## Objective
Implement the final 5 remaining scaffolding buckets for the School SIS web application to complete the platform's production readiness:
1. **Financial & Treasury**: `/treasury` ledgers and `/integrations/tally` export logic.
2. **HQ & Multi-Tenant Management**: `/hq` and `/platform` global administrative controls.
3. **Advanced Analytics**: `/analytics` dashboards and the central `/calendar`.
4. **Student Success**: `/university` (placements), `/alumni` tracking, and `/international`.
5. **Daily Utilities**: `/documents` (storage/verification) and `/diary` (daily logs).

## Architecture & Design Principles
- **Dual Track**: Parallel track for opaque-box E2E test suite implementation and implementation track.
- **Genuine Implementation**: Zero tolerance for hardcoded data or dummy implementations. Replace useState or mock arrays with live Drizzle ORM queries and server actions.
- **Database Schema Sync**: Perform `npx drizzle-kit push` for all modified or created schema files.
- **Interface Contracts**: Establish clean server action contracts for each module.

## Milestones
1. **M1: E2E Test Suite Expansion**
   - Identify features, update `TEST_INFRA.md`.
   - Write Tier 1-4 E2E tests for the new 5 modules/domains in `apps/web/e2e/`.
   - Publish `TEST_READY.md`.
2. **M2: Financial & Treasury Implementation**
   - Wire `/treasury` ledgers dashboard and `/integrations/tally` export functionality to backend.
   - Synchronize any database changes.
3. **M3: HQ & Multi-Tenant Management Implementation**
   - Wire `/hq` and `/platform` routes/features to database backend.
   - Sync database schema files (`platform.ts`, `hq.ts`).
4. **M4: Advanced Analytics Implementation**
   - Wire `/analytics` dashboards (queries real database data) and `/calendar` academic events.
   - Sync database schema files (`calendar.ts`, etc.).
5. **M5: Student Success Implementation**
   - Wire `/university` (placements), `/alumni` tracking, and `/international` pages.
   - Sync database schema files (`alumni.ts`, `international.ts`, `higher_ed.ts`).
6. **M6: Daily Utilities Implementation**
   - Wire `/documents` (storage/verification) and `/diary` (daily logs).
   - Sync database schema files (`documents.ts`, etc.).
7. **M7: Final Integration & Verification**
   - Verify zero TypeScript compiler errors (`npm run build`).
   - Run full E2E test suite (100% pass).
   - Forensic Auditor verification to ensure no cheating/facade code exists.

## Execution Strategy
- Project Pattern.
- EP1: Spawn E2E Testing Orchestrator (sub-orchestrator) for M1.
- EP2: Spawn Implementation Orchestrator (sub-orchestrator) for M2-M6.
- EP3: Synthesize and coordinate integration, verify with E2E suite and Forensic Auditor.
