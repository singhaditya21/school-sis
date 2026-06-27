# Original User Request

## Initial Request — 2026-06-27T06:50:16Z

Migrate the remaining 5 scaffolded modules (Gradebook, Hostel, Timetable Substitution, Library, Diary/Appointments) off the legacy `scaffolding-bridge.ts`. For each module, implement a dedicated backend `service.ts` using parameterized `pg.Pool` queries and upgrade the frontend generic tables to fully interactive Radix/shadcn UI components matching the reference implementation in the Parent Portal.

Working directory: /Users/adityasingh/PersonalWork/school-sis/apps/web
Integrity mode: benchmark

## Requirements

### R1. Backend Service Implementation
For each of the 5 modules, create a dedicated `lib/services/[module]/[module].service.ts` file. Replace the legacy `scaffolding-bridge.ts` exports with strictly typed, paginated, and parameterized raw PostgreSQL (`pg.Pool`) queries.

### R2. Frontend UI Overhaul
Replace the native HTML `<table>` elements in the respective UI routes with the `shadcn/Radix` UI `<Table>` and `<Badge>` components. Ensure the new backend service is imported and integrated seamlessly.

### R3. Scaffolding Cleanup
Remove the legacy functions for these 5 modules from `src/lib/actions/scaffolding-bridge.ts` entirely.

## Acceptance Criteria

### Verification
- [ ] `npm run build` compiles successfully with zero TypeScript or import errors.
- [ ] A text search confirms `scaffolding-bridge.ts` no longer contains any functions related to these 5 modules.
- [ ] A UI scan confirms the targeted module pages (`src/app/(admin)/hostel/fees/page.tsx`, etc.) import `Table` from `@/components/ui/table`.
