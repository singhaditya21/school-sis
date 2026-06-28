# Scope: Implementation of Core Operations Modules

## Architecture
- **Backend Services**: Located in `apps/web/src/lib/services/[module]/[module].service.ts` or similar path. They use Drizzle ORM queries directly, replacing raw SQL where appropriate. Access control is managed in each action via `requireAuth(permission)`.
- **Frontend Pages**: React server/client components in `apps/web/src/app/(admin)/[module]/...`. They consume the backend service methods, using shadcn UI `<Table>` and `<Badge>` components for consistent formatting and presentation.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Fix Monorepo Build | Fix incorrect `@/components/ui/card` import in `apps/website/src/app/(public)/apply-online/apply/page.tsx` | None | DONE |
| M2 | Implement Hostel Module | Implement/Verify Hostel schema, backend service, and UI pages. | M1 | DONE |
| M3 | Implement Transport Module | Implement/Verify Transport schema, backend service (GPS/route mapping logic), and UI pages. | M1 | DONE |
| M4 | Implement Timetable Module | Implement/Verify Timetable schema, backend service (teacher collision prevention), and UI pages. | M1 | DONE |
| M5 | Implement Library Module | Implement/Verify Library schema, backend service (barcode/ISBN processing), and UI pages. | M1 | DONE |
| M6 | Implement Inventory Module | Implement/Verify Inventory schema, backend service, and UI pages. | M1 | DONE |
| M7 | Integration & Verification | Wait for E2E tests, run tests, run Forensic Auditor, and perform white-box hardening (Tier 5). | M2, M3, M4, M5, M6 | DONE |

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
