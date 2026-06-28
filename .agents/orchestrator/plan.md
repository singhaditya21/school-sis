# Project Plan: School SIS Core Operations Implementation

## Objective
Implement 5 remaining Core Operations modules (Hostel, Transport, Timetable, Library, Inventory) for the School SIS web application to move them from scaffolding to full comprehensive production features.

## Architecture & Design Principles
- **Opaque-Box Testing**: E2E Testing track builds requirement-driven tests independent of implementation details.
- **Genuine Implementation**: Zero tolerance for hardcoding or facade implementations.
- **Database Synchronization**: Run `npx drizzle-kit push` for schema updates.
- **UI Integration**: Drizzle ORM queries and server actions replacing all mocks/useState client data.

## Milestones
1. **M0: Exploration & Baseline Assessment**
   - Run explorer to understand the current scaffolding, database setup, and layout of the 5 modules.
   - Define global `PROJECT.md` at root.
2. **M1: E2E Test Suite Creation**
   - Spawn E2E Testing Orchestrator.
   - Define `TEST_INFRA.md`.
   - Write Tier 1 (Feature Coverage), Tier 2 (Boundary), Tier 3 (Cross-feature) and Tier 4 (Real-world) test cases.
   - Publish `TEST_READY.md`.
3. **M2: Hostel Module Implementation**
   - Setup schema, run push, implement backend service, wire frontend UI.
4. **M3: Transport Module Implementation**
   - Setup schema, run push, implement backend service with GPS routing mapping logic, wire frontend UI.
5. **M4: Timetable Module Implementation**
   - Setup schema, run push, implement backend service with conflict-resolution algorithms (teacher collision check), wire frontend UI.
6. **M5: Library Module Implementation**
   - Setup schema, run push, implement backend service with barcode/ISBN processing logic, wire frontend UI.
7. **M6: Inventory Module Implementation**
   - Setup schema, run push, implement backend service, wire frontend UI.
8. **M7: E2E Verification & Adversarial Hardening**
   - Verify all tests pass.
   - Run Tier 5 (Adversarial Coverage Hardening) where Challenger generates adversarial test cases and Worker fixes gaps.
   - Forensic Audit verification.

## Execution Strategy
- Use Project Pattern.
- Delegate implementation track and E2E testing track to sub-orchestrators/workers.
- Track progress via `progress.md` and update `BRIEFING.md`.
