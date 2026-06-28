# Project: School SIS Core Operations Implementation

## Architecture
- **Backend Services**: Located in `apps/web/src/lib/services/[module]/[module].service.ts` or similar path. They use Drizzle ORM queries directly, replacing raw SQL where appropriate. Access control is managed in each action via `requireAuth(permission)`.
- **Frontend Pages**: React server/client components in `apps/web/src/app/(admin)/[module]/...`. They consume the backend service methods, using shadcn UI `<Table>` and `<Badge>` components for consistent formatting and presentation.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | E2E Testing Track | Design and establish baseline E2E test cases to verify the pages | None | DONE (Conv ID: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b) |
| M2 | Implement Hostel Module | Implement drizzle schema, backend service, and UI wiring for Hostel. | M1 | DONE (Conv ID: 6d34308d-5f38-4392-ba6e-df2fb1c2966e) |
| M3 | Implement Transport Module | Implement drizzle schema, backend service with GPS routing mapping logic, and UI wiring for Transport. | M1 | DONE (Conv ID: 6d34308d-5f38-4392-ba6e-df2fb1c2966e) |
| M4 | Implement Timetable Module | Implement drizzle schema, backend service with teacher collision prevention logic, and UI wiring for Timetable. | M1 | DONE (Conv ID: 6d34308d-5f38-4392-ba6e-df2fb1c2966e) |
| M5 | Implement Library Module | Implement drizzle schema, backend service with barcode/ISBN processing logic, and UI wiring for Library. | M1 | DONE (Conv ID: 6d34308d-5f38-4392-ba6e-df2fb1c2966e) |
| M6 | Implement Inventory Module | Implement drizzle schema, backend service, and UI wiring for Inventory. | M1 | DONE (Conv ID: 6d34308d-5f38-4392-ba6e-df2fb1c2966e) |
| M7 | Integration & Verification | Run final builds, unit/E2E tests, and execute Forensic Auditor validation. | M2, M3, M4, M5, M6 | DONE (Conv ID: 6d34308d-5f38-4392-ba6e-df2fb1c2966e) |

## Interface Contracts
### Hostel Service
- `getHostelOverview(tenantId: string)`
- `getHostelFees(tenantId: string, filters: { status?: string, feeType?: string })`
- `sendPaymentReminder(tenantId: string, feeId: string)`

### Transport Service
- `getRoutes(tenantId: string)`
- `createRoute(tenantId: string, data: any)`
- `getGPSPing(tenantId: string, vehicleId: string)` (returns latitude/longitude)

### Timetable Service
- `getTimetableGrid(tenantId: string, sectionId: string)`
- `createTimetableEntry(tenantId: string, data: any)` (with conflict-resolution logic checking teacher and room collisions)
- `getSubstitutions(tenantId: string)`
- `createSubstitutionRequest(tenantId: string, data: any)`

### Library Service
- `getBooks(tenantId: string)`
- `issueBook(tenantId: string, data: { bookId: string, studentId: string, isbnOrBarcode?: string })` (with barcode/ISBN processing/validation logic)
- `getBorrowHistory(tenantId: string)`

### Inventory Service
- `getAssets(tenantId: string)`
- `getConsumables(tenantId: string)`
- `getStockAlerts(tenantId: string)`

## Code Layout
- Backend Services: `apps/web/src/lib/services/`
  - Hostel: `hostel/hostel.service.ts`
  - Transport: `transport/transport.service.ts`
  - Timetable: `timetable/timetable.service.ts`
  - Library: `library/library.service.ts`
  - Inventory: `inventory/inventory.service.ts`
- Frontend Pages:
  - Hostel Overview: `apps/web/src/app/(admin)/hostel/page.tsx`
  - Hostel Fees: `apps/web/src/app/(admin)/hostel/fees/page.tsx`
  - Transport routes: `apps/web/src/app/(admin)/transport/page.tsx`
  - Transport new route: `apps/web/src/app/(admin)/transport/new/page.tsx`
  - Timetable Grid: `apps/web/src/app/(admin)/timetable/grid/page.tsx`
  - Timetable Substitution: `apps/web/src/app/(admin)/timetable/substitution/page.tsx`
  - Library Catalog: `apps/web/src/app/(admin)/library/page.tsx`
  - Library Issue: `apps/web/src/app/(admin)/library/issue/page.tsx`
  - Library History: `apps/web/src/app/(admin)/library/history/page.tsx`
  - Inventory: `apps/web/src/app/(admin)/inventory/page.tsx`
  - Inventory Alerts: `apps/web/src/app/(admin)/inventory/alerts/page.tsx`
