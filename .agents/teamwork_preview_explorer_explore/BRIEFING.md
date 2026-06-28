# BRIEFING — 2026-06-28T12:18:26+05:30

## Mission
Investigate the School SIS web application codebase and UI pages for the 5 Core Operations modules (Hostel, Transport, Timetable, Library, Inventory), database schema, login flow, and existing E2E tests, and design 60 E2E test scenarios.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Read-only investigation: analyze problems, synthesize findings, produce structured reports
- Working directory: /Users/adityasingh/PersonalWork/school-sis/.agents/teamwork_preview_explorer_explore
- Original parent: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b
- Milestone: school-sis investigation and test scenario design

## 🔒 Key Constraints
- Read-only investigation — do NOT implement code changes
- Keep BRIEFING.md under ~100 lines (act as an index, not a log)
- No external web search (CODE_ONLY network mode)
- Follow workspace conventions (write only in our directory)

## Current Parent
- Conversation ID: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b
- Updated: 2026-06-28T12:18:26+05:30

## Investigation State
- **Explored paths**:
  - `apps/web/src/app/(admin)/(hostel|transport|timetable|library|inventory)`
  - `apps/web/src/app/(parent)/my-transport`
  - `apps/web/src/lib/actions` and `apps/web/src/lib/services`
  - `apps/web/src/lib/db/schema`
- **Key findings**:
  - Hostel: Tables: `hostels`, `hostel_rooms`, `hostel_allocations`, `mess_menus`, `hostel_fees`. Actions: getHostels, getHostelStats, getRooms, getAllocations, allocateStudent, vacateStudent, getMessMenu, getHostelFees.
  - Transport: Tables: `vehicles`, `routes`, `stops`, `student_transport`, `vehicle_maintenance_logs`, `driver_background_checks`, `live_gps_pings`. Actions: getVehicles, getRoutes, getRouteDetail.
  - Timetable: Tables: `periods`, `timetable_entries`, `substitutions`, `substitution_requests`. Actions: getPeriods, getTimetableForSection, getSectionsForTimetable, checkConflicts, createTimetableEntry, bulkCreateEntries, getSubstitutionSuggestions, createSubstitutionRequest.
  - Library: Tables: `books`, `book_issues`, `book_reservations`. Actions: getBooks, addBook, getLibraryStats, issueBook, returnBook, getOverdueList.
  - Inventory: Tables: `assets`, `consumables`, `stock_alerts`. Actions: getAssets, addAsset, getConsumables, addConsumable, restockConsumable, getStockAlerts, generateStockAlerts, getInventoryStats.
- **Unexplored areas**: User login flow (Admin, Teacher, Parent) in `/login` page and authentication helpers in E2E tests; E2E tests in `apps/web/e2e`.

## Key Decisions Made
- Stored schema findings and action findings. Moving to login flow and E2E test files exploration.

## Artifact Index
- ORIGINAL_REQUEST.md — Original task description
- progress.md — Current status checklist

