# E2E Test Suite Ready

## Test Runner

- Command: `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/hostel-core.spec.ts e2e/transport-core.spec.ts e2e/timetable-core.spec.ts e2e/library-core.spec.ts e2e/inventory-core.spec.ts --workers=1`
- Expected: All 60 test cases pass cleanly with exit code 0.

## Coverage Summary

| Tier | Count | Description |
|---|---|---|
| **Tier 1: Feature Coverage** | 25 | 5 test cases per module (Hostel, Transport, Timetable, Library, Inventory) |
| **Tier 2: Boundary & Corner Cases** | 25 | 5 test cases per module covering boundaries, empty states, and invalid roles |
| **Tier 3: Cross-Feature Combinations** | 5 | 1 cross-feature integration test case per module |
| **Tier 4: Real-World Application Scenarios** | 5 | 5 comprehensive workflows (Hostel waitlist, Timetable absentee, Library overdue audit, Inventory term-end restock, Timetable bulk setup) |
| **Total** | **60** | **All 60 tests pass cleanly** |

## Feature Checklist

### Hostel Management (`e2e/hostel-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-HS-101: Hostel Dashboard loading and KPI cards
  - E2E-HS-102: View active allocations table
  - E2E-HS-103: Filter hostel fees by status paid
  - E2E-HS-104: Filter hostel fees by fee type mess
  - E2E-HS-105: Clear hostel fees filters
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-HS-201: Fee list empty state with overdue filter
  - E2E-HS-202: Unauthenticated user redirection to login
  - E2E-HS-203: Access restricted for Parent role (redirects to unauthorized)
  - E2E-HS-204: Occupancy Rate displays "0%" when there are no active allocations
  - E2E-HS-205: Verify Mess Menu weekly meal scheduler display (e.g. days sorted Monday-Sunday)
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-301: Hostel Room Allocation triggers Hostel Fee Creation
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-401: Hostel Vacating & Waitlist Reallocation workflow (Hostel waitlist)

### Transport Management (`e2e/transport-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-TR-101: View Configured Routes List
  - E2E-TR-102: Open Create Route Form
  - E2E-TR-103: Cancel Route Creation
  - E2E-TR-104: Parent Portal My Transport Assigned View
  - E2E-TR-105: Verify Empty Routes Placeholder
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-TR-201: Route Create Input Validations
  - E2E-TR-202: Unassigned Parent Transport View
  - E2E-TR-203: Invalid Route Details Parameter handling
  - E2E-TR-204: Transport Route Access Restricted for Teacher Role
  - E2E-TR-205: Driver phone format inputs validation
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-302: Student Transport route assignment integrates transport fee
- **Tier 4 (Real-World Application Scenarios)**:
  - *No specific Tier 4 test (covered in Timetable/Library/Inventory/Hostel)*

### Timetable Management (`e2e/timetable-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-TT-101: View Timetable Section Dashboard
  - E2E-TT-102: Load Substitution Dashboard Statistics
  - E2E-TT-103: Open Create Substitution Dialog
  - E2E-TT-104: View Absent Teachers list
  - E2E-TT-105: Timetable Grid Placeholder Check
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-TT-201: Substitution Form validation error on empty submit
  - E2E-TT-202: Dialog missing subject validation
  - E2E-TT-203: Timetable Entry Teacher Double-Booking Check
  - E2E-TT-204: Timetable Entry Room Double-Booking Check
  - E2E-TT-205: Substitution details invalid id routing
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-303: Timetable Substitution Request approval updates teacher schedule
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-403: Start-of-Day Absenteeism Substitution routing (Timetable absentee)
  - E2E-WRK-405: New Term Class Period Schedule Bulk Uploading (Timetable bulk setup)

### Library Management (`e2e/library-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-LB-101: View Books Catalog table
  - E2E-LB-102: Switch Library Issue/Return Modes
  - E2E-LB-103: Catalog Search Filtering
  - E2E-LB-104: Issue Book Form Submission
  - E2E-LB-105: Return Book Form Submission
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-LB-201: Issue book validator blocks empty book select
  - E2E-LB-202: Issue book validator blocks empty student select
  - E2E-LB-203: Search box keyword returns no matching catalog titles
  - E2E-LB-204: Issue book validator blocks student with missing user account
  - E2E-LB-205: Borrowing history filters search with zero matches
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-304: Library Overdue return triggers unpaid fine addition
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-403: Monthly Library Overdue Audit & Fine Recovery loop (Library overdue audit)

### Inventory Management (`e2e/inventory-core.spec.ts`)
- **Tier 1 (Feature Coverage)**:
  - E2E-IN-101: View Assets Log
  - E2E-IN-102: View Consumables Log
  - E2E-IN-103: View Inventory Alert Dashboard
  - E2E-IN-104: View Reorder Suggestions
  - E2E-IN-105: Filter Stock Alerts by Severity
- **Tier 2 (Boundary & Corner Cases)**:
  - E2E-IN-201: Consumable low-stock red background indicator
  - E2E-IN-202: Stock Alerts empty alert dashboard
  - E2E-IN-203: Asset condition tag fallback check
  - E2E-IN-204: Unauthenticated access block on alerts route
  - E2E-IN-205: Alerts access rejected for Parent role
- **Tier 3 (Cross-Feature Combinations)**:
  - E2E-COM-305: Inventory Asset condition change triggers Maintenance notification
- **Tier 4 (Real-World Application Scenarios)**:
  - E2E-WRK-404: End-of-Term Inventory Asset Auditing & Restock (Inventory term-end restock)
