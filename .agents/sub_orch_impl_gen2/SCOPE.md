# Scope: Implementation Track Migration (Gen 2)

## Architecture
- **Backend Services**: Parametric queries using native `pg.Pool` (`pool.query`) located in `apps/web/src/lib/services/[module]/[module].service.ts` enforcing tenant isolation.
- **Next.js Server Actions Constraints**: Next.js Server Actions files (marked with `'use server'` at the top) CANNOT export objects like `export const LibraryService = { ... }`. They must export individual async functions (e.g. `export async function getLibraryStudents() { ... }`).
- **RBAC**: Explicit user permissions registered in `apps/web/src/lib/rbac/permissions.ts`.
- **Frontend Pages**: Refactored to import from the backend services (via server actions or direct server component invocations) and rendered using shadcn/Radix UI Table and Badge components.
- **Scaffolding Cleanup**: Migrated legacy functions removed from `apps/web/src/lib/actions/scaffolding-bridge.ts`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Migrate Gradebook | Verify and complete Gradebook migration, ensure service conforms to Server Action constraints | None | IN_PROGRESS |
| M2 | Migrate Hostel | Integrate Hostel changes, ensure service conforms to Server Action constraints | None | IN_PROGRESS |
| M3 | Migrate Timetable Substitution | Integrate Timetable changes, ensure service conforms to Server Action constraints | None | IN_PROGRESS |
| M4 | Migrate Library | Verify and complete Library migration, ensure service conforms to Server Action constraints | None | IN_PROGRESS |
| M5 | Migrate Diary/Appointments | Integrate Diary/Appointments changes, ensure service conforms to Server Action constraints | None | IN_PROGRESS |
| M6 | Scaffolding Bridge Cleanup | Remove migrated legacy functions from `scaffolding-bridge.ts`, ensure all page files build successfully | M1, M2, M3, M4, M5 | PLANNED |
| M7 | E2E Testing & Verification | Run builds and E2E verification test suite (once TEST_READY.md is published) | M6 | PLANNED |

## Interface Contracts
### Gradebook Service (`apps/web/src/lib/services/gradebook/gradebook.service.ts`)
- `getGradebookData(classId?: string): Promise<{ classes: any[], exams: any[], students: any[] }>`

### Hostel Service (`apps/web/src/lib/services/hostel/hostel.service.ts`)
- `getHostelFees(status?: string, feeType?: string): Promise<any[]>`

### Timetable Substitution Service (`apps/web/src/lib/services/timetable/timetable.service.ts`)
- `getSubstitutionTeachers(): Promise<any[]>`
- `getSubstitutionRequests(): Promise<any[]>`

### Library Service (`apps/web/src/lib/services/library/library.service.ts`)
- `getLibraryStudents(): Promise<any[]>`
- `getLibraryHistory(): Promise<any[]>` (moved from history page's inline query)

### Diary Service (`apps/web/src/lib/services/diary/diary.service.ts`)
- `getDiaryEntries(): Promise<any[]>`

### Appointments Service (`apps/web/src/lib/services/appointments/appointments.service.ts`)
- `getAppointments(): Promise<any[]>`
