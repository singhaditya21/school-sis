# Project: School SIS Scaffolding Bridge Deprecation and Module Migration

## Architecture
- **Backend Services**: Located in `apps/web/src/lib/services/[module]/[module].service.ts`. They use `pool.query` to execute parameterized PostgreSQL queries directly. Access control is managed in each action via `requireAuth(permission)`.
- **Frontend Pages**: React server/client components in `apps/web/src/app/(admin)/[module]/...`. They consume the backend service methods, using shadcn UI `<Table>` and `<Badge>` components for consistent formatting and presentation.
- **Scaffolding Cleanup**: The legacy `apps/web/src/lib/actions/scaffolding-bridge.ts` will have functions for Gradebook, Hostel, Timetable Substitution, Library, and Diary/Appointments removed, leaving only templates or generic operations if needed.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | E2E Testing Track | Design and establish baseline E2E test cases to verify the pages | None | PLANNED |
| M2 | Migrate Gradebook | Create `gradebook.service.ts` with pg queries, delete legacy function | M1 | PLANNED |
| M3 | Migrate Hostel | Implement `hostel.service.ts` with `getHostelFees`, refactor `hostel/fees/page.tsx` table/badge | M1 | PLANNED |
| M4 | Migrate Timetable Substitution | Implement `timetable.service.ts` with substitution queries, refactor `timetable/substitution/page.tsx` table/badge | M1 | PLANNED |
| M5 | Migrate Library | Update `library.service.ts` with borrow queries, refactor `library/issue/page.tsx` and `library/history/page.tsx` table/badge | M1 | PLANNED |
| M6 | Migrate Diary/Appointments | Create `diary.service.ts` and `appointments.service.ts` queries, refactor `diary/page.tsx` and `appointments/page.tsx` table/badge | M1 | PLANNED |
| M7 | Scaffolding Cleanup & Verification | Remove migrated functions from `scaffolding-bridge.ts`, run final builds and tests | M2, M3, M4, M5, M6 | PLANNED |

## Interface Contracts
### Gradebook Service
- `getGradebookData(classId?: string): Promise<{ classes: any[], exams: any[], students: any[] }>`

### Hostel Service
- `getHostelFees(status?: string, feeType?: string): Promise<any[]>`

### Timetable Substitution Service
- `getSubstitutionTeachers(): Promise<any[]>`
- `getSubstitutionRequests(): Promise<any[]>`

### Library Service
- `getLibraryStudents(): Promise<any[]>`
- `getOverdueBooks(tenantId: string): Promise<any[]>` (optional/if needed)

### Diary Service
- `getDiaryEntries(): Promise<any[]>`

### Appointments Service
- `getAppointments(): Promise<any[]>`

## Code Layout
- Backend Services: `apps/web/src/lib/services/`
  - Gradebook: `gradebook/gradebook.service.ts`
  - Hostel: `hostel/hostel.service.ts`
  - Timetable: `timetable/timetable.service.ts`
  - Library: `library/library.service.ts`
  - Diary: `diary/diary.service.ts`
  - Appointments: `appointments/appointments.service.ts`
- Frontend Pages:
  - Hostel Fees: `apps/web/src/app/(admin)/hostel/fees/page.tsx`
  - Library Issue: `apps/web/src/app/(admin)/library/issue/page.tsx`
  - Library History: `apps/web/src/app/(admin)/library/history/page.tsx`
  - Substitution: `apps/web/src/app/(admin)/timetable/substitution/page.tsx`
  - Diary: `apps/web/src/app/(admin)/diary/page.tsx`
  - Appointments: `apps/web/src/app/(admin)/appointments/page.tsx`
