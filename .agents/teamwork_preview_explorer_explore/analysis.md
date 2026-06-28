# E2E Test Analysis and Scenario Design Report
**Location**: `/Users/adityasingh/PersonalWork/school-sis/.agents/teamwork_preview_explorer_explore/analysis.md`
**Date**: 2026-06-28
**Scope**: Hostel, Transport, Timetable, Library, Inventory

---

## 1. Executive Summary
This report presents a thorough investigation of the Next.js routes, server actions, services, database schemas, authentication flows, and existing E2E tests for the **5 Core Operations modules** (Hostel, Transport, Timetable, Library, Inventory) in the School SIS web application. 

Key outcomes include:
1. Complete mapping of the UI page structures, server actions, and database tables.
2. Detailed breakdown of the multi-mode login process (School Staff vs. Platform Admin).
3. 60 E2E Playwright test scenarios spanning Happy Paths, Boundary Cases, Cross-Feature Combinations, and Real-world Workloads.

---

## 2. Module-by-Module Codebase & UI Examination

### A. Hostel Module
* **Directory**: `apps/web/src/app/(admin)/hostel`
* **Pages**:
  * `/hostel`: Main page for hostel administration. Renders KPI cards for stats (Total Hostels, Total Beds, Occupied, Available, Occupancy Rate), lists active hostels, and displays a table of active student allocations.
  * `/hostel/fees`: Renders hostel and mess fee payment status. Supports filtering by status (`paid`, `pending`, `overdue`) and fee type (`hostel`, `mess`, `caution`). Displays stats (Total Collected, Pending, Overdue, Total Outstanding) and a list of fee records.
* **Key Components & Forms**:
  * Select boxes for filtering fee records by status and fee type, and a "Clear" button.
  * KPI Cards for occupancy and financial outstanding.
* **Server Actions & Services** (`src/lib/actions/hostel.ts` & `src/lib/services/hostel/hostel.service.ts`):
  * `getHostels()`, `getHostelStats()`, `getRooms()`, `getAllocations()` for querying data.
  * `allocateStudent()`, `vacateStudent()` for mutating occupant mappings and updating counters in the room/hostel tables.
  * `getHostelFees()` for fetching fee payment logs.

### B. Transport Module
* **Directory**: `apps/web/src/app/(admin)/transport` & `(parent)/my-transport`
* **Pages**:
  * `/transport`: Lists all configured routes in a card-based grid (showing stop counts, student counts, morning departure times, and monthly fees).
  * `/transport/new`: Admin route creation form (visual layout with form fields but lacks click/submit event bindings).
  * `/my-transport` (Parent route): Lists the transport routes assigned to the parent's children.
* **Key Components & Forms**:
  * New Route Form: Inputs for Route Name, Route Number, Start/End Points, Vehicle Number, Driver Name, Driver Contact.
* **Server Actions & Services** (`src/lib/actions/transport.ts`):
  * `getVehicles()`: Fetch list of school vehicles and associated route counts.
  * `getRoutes()`: Fetch list of routes, stop counts, and assigned students.
  * `getRouteDetail(routeId)`: Query route details and the ordered stops on the route.

### C. Timetable Module
* **Directory**: `apps/web/src/app/(admin)/timetable`
* **Pages**:
  * `/timetable`: Renders classes/sections grouped by grade.
  * `/timetable/grid`: Grid layout showing Days (Monday-Saturday) against Periods (Period 1-8). (Note: Grid cells have a placeholder text "Click to assign" and a notice card stating it will be integrated with the Java API).
  * `/timetable/new`: Client-side form to create new timetable entries (visual dropdown selectors).
  * `/timetable/substitution`: Interactive dashboard for substitution requests. Shows statistics cards (Today's, Pending, Teachers Absent, Available) and lists absent teachers and substitution records. It opens a modal dialog to create new requests.
* **Key Components & Forms**:
  * New Entry Form: Select dropdowns for Class, Subject, Day, Period; text inputs for Teacher, Room.
  * Create Substitution Request Dialog: Dropdowns for Absent Teacher, Period, text inputs for Date, Subject, and list of available substitutes.
* **Server Actions & Services** (`src/lib/actions/timetable.ts` & `src/lib/services/timetable/timetable.service.ts`):
  * `getPeriods()`, `getTimetableForSection()`, `getSectionsForTimetable()`.
  * `checkConflicts()`: Prevents teacher double-booking (`TEACHER_DOUBLE_BOOKED`) and room double-booking (`ROOM_DOUBLE_BOOKED`).
  * `createTimetableEntry()`, `bulkCreateEntries()`.
  * `getSubstitutionTeachers()`, `getSubstitutionRequests()`, `getSubstitutionSuggestions()`, `createSubstitutionRequest()`.

### D. Library Module
* **Directory**: `apps/web/src/app/(admin)/library`
* **Pages**:
  * `/library`: Main page displaying library KPIs (Total Titles, Total Copies, Available, Issued Today, Overdue, Fines Pending) and the complete books catalog table.
  * `/library/history`: Lists borrowing history, dynamically calculates dynamic overdue fines (₹5/day), and filters by status (`ISSUED`, `OVERDUE`, `RETURNED`, `LOST`).
  * `/library/issue`: Interactive panel with tab buttons to switch between "Issue Book" (search and select books/students) and "Return Book" (lists currently issued books with action buttons to return).
* **Key Components & Forms**:
  * Book Search Input, Book Selection Dropdown, Student Selection Dropdown, Return Action Buttons.
* **Server Actions & Services** (`src/lib/actions/library.ts` & `src/lib/services/library/library.service.ts`):
  * `getBooks()`, `addBook()`, `getLibraryStats()`, `issueBook()`, `returnBook()`, `getOverdueList()`.
  * `getLibraryStudents()`: Auto-resolves the user ID of the student or their primary guardian.
  * `getLibraryHistory()`: Returns the detailed logs.

### E. Inventory Module
* **Directory**: `apps/web/src/app/(admin)/inventory`
* **Pages**:
  * `/inventory`: Dashboard showing Assets table and Consumables table, alongside summary KPIs (Total Assets, Asset Value, Low Stock, Active Alerts).
  * `/inventory/alerts`: Lists active warnings (Low Stock vs. Out of Stock) and suggests reorder quantities based on reorder levels.
* **Key Components & Forms**:
  * Stock Alert severity filter cards (Critical, Warning, Info, Total).
* **Server Actions & Services** (`src/lib/actions/inventory.ts`):
  * `getAssets()`, `addAsset()`, `getConsumables()`, `addConsumable()`, `restockConsumable()`.
  * `getStockAlerts()`, `generateStockAlerts()` (automates critical alert creation for 0-stock items).
  * `getInventoryStats()`.

---

## 3. Database Schemas & Storage Details

### A. Hostel Schema (`src/lib/db/schema/hostel.ts`)
* **`hostels`**: Stores main hostels. Fields: `id` (UUID), `tenantId` (UUID), `name`, `type` (BOYS, GIRLS, CO_ED), `wardenId` (UUID -> users), `totalRooms`, `totalBeds`, `occupiedBeds`, `isActive`.
* **`hostel_rooms`**: Rooms inside hostels. Fields: `id`, `tenantId`, `hostelId`, `roomNumber`, `floor`, `type` (SINGLE, DOUBLE, TRIPLE, DORMITORY), `totalBeds`, `occupiedBeds`, `status` (AVAILABLE, FULL, MAINTENANCE).
* **`hostel_allocations`**: Active student mappings. Fields: `id`, `tenantId`, `studentId`, `hostelId`, `roomId`, `bedNumber`, `allocatedFrom` (date), `allocatedTo` (date), `status` (ACTIVE, VACATED, PENDING).
* **`mess_menus`**: Weekly meal scheduler. Fields: `id`, `tenantId`, `hostelId`, `day` (varchar), `breakfast`, `lunch`, `snacks`, `dinner`.
* **`hostel_fees`**: Raw table (queried in service). Fields: `id`, `tenantId`, `studentId`, `feeType` (hostel, mess, caution), `amount`, `dueDate`, `status` (paid, pending, overdue), `paidDate`.

### B. Transport Schema (`src/lib/db/schema/transport.ts`)
* **`vehicles`**: Physical fleet details. Fields: `id`, `tenantId`, `vehicleNumber`, `type`, `capacity`, `driverName`, `driverPhone`, `insuranceExpiry`, `fitnessExpiry`.
* **`routes`**: Travel paths. Fields: `id`, `tenantId`, `vehicleId`, `name`, `description`, `morningDepartureTime`, `afternoonDepartureTime`, `monthlyFee` (numeric).
* **`stops`**: Collection locations. Fields: `id`, `routeId` (cascade delete), `name`, `address`, `latitude`, `longitude`, `pickupTime`, `dropTime`, `displayOrder`.
* **`student_transport`**: Assignment table. Fields: `id`, `tenantId`, `studentId`, `routeId`, `stopId`, `startDate`, `endDate`.
* **`vehicle_maintenance_logs`**: Service history. Fields: `id`, `tenantId`, `vehicleId`, `serviceDate`, `serviceType`, `cost`, `performedBy`, `nextDueDate`.
* **`driver_background_checks`**: Security clearance records. Fields: `id`, `tenantId`, `driverName`, `licenseNumber`, `checkDate`, `status` (Passed, Pending, Failed), `clearanceExpiry`.
* **`live_gps_pings`**: IoT tracking metrics. Fields: `id`, `vehicleId`, `latitude`, `longitude`, `speedKmh`, `pingTime`.

### C. Timetable Schema (`src/lib/db/schema/timetable.ts`)
* **`periods`**: Timetable structure intervals. Fields: `id`, `tenantId`, `name`, `startTime`, `endTime`, `displayOrder`, `isBreak` (0/1).
* **`timetable_entries`**: Mappings. Fields: `id`, `tenantId`, `sectionId`, `periodId`, `subjectId`, `teacherId`, `dayOfWeek` (Enum: MONDAY, TUESDAY, etc.), `roomNumber`.
* **`substitutions`**: Executed teacher assignments. Fields: `id`, `tenantId`, `timetableEntryId`, `originalTeacherId`, `substituteTeacherId`, `date`, `reason`.
* **`substitution_requests`**: Raw request logging. Fields: `id`, `tenantId`, `teacherId`, `substituteId`, `sectionId`, `period`, `date`, `reason`, `status` (pending, approved, completed).

### D. Library Schema (`src/lib/db/schema/library.ts`)
* **`books`**: Book titles. Fields: `id`, `tenantId`, `title`, `author`, `isbn`, `publisher`, `edition`, `year`, `category` (Enum: TEXTBOOK, REFERENCE, FICTION, etc.), `location` (shelf/rack), `totalCopies`, `availableCopies`, `price`, `isActive`.
* **`book_issues`**: Lending transactions. Fields: `id`, `tenantId`, `bookId`, `issuedToUserId`, `issuedToStudentId`, `issueDate` (date), `dueDate` (date), `returnDate`, `status` (ISSUED, RETURNED, OVERDUE, LOST), `fineAmount` (numeric), `isFinePaid` (boolean), `issuedBy`, `returnedTo`.
* **`book_reservations`**: Holds. Fields: `id`, `tenantId`, `bookId`, `userId`, `reservedAt`, `expiresAt`, `status`.

### E. Inventory Schema (`src/lib/db/schema/inventory.ts`)
* **`assets`**: Fixed assets logs. Fields: `id`, `tenantId`, `name`, `category` (FURNITURE, IT_EQUIPMENT, etc.), `serialNumber`, `purchaseDate`, `purchasePrice`, `vendor`, `location`, `condition` (EXCELLENT, GOOD, FAIR, NEEDS_REPAIR, DISPOSED).
* **`consumables`**: Stock items. Fields: `id`, `tenantId`, `name`, `category` (STATIONERY, CLEANING, etc.), `unit`, `currentStock`, `minimumStock`, `reorderLevel`, `unitPrice`, `supplier`, `lastRestockDate`.
* **`stock_alerts`**: Warning triggers. Fields: `id`, `tenantId`, `itemId`, `itemType` (ASSET, CONSUMABLE), `alertType` (LOW_STOCK, OUT_OF_STOCK), `severity` (CRITICAL, WARNING, INFO), `message`, `isResolved`.

---

## 4. Authentication & Login Flow (Admin, Teacher, Parent)

### The UI Form (`/login`)
The `/login` screen uses a client-side component supporting a toggle for **School Staff** vs. **Platform Admin**. 
* **School Staff Mode**: Requires entering `School Code` (defaults to `"GREENWOOD"` in state), `Email`, and `Password`.
* **Platform Admin Mode**: Bypasses the School Code and takes only `Email` and `Password`.
* **Authentication Options**: Allows authenticating via Password tab or OTP tab (mock UI trigger).

### The Action V2 (`loginActionV2`)
1. Parses inputs using a Zod schema (`email`, `password`, `schoolCode`).
2. Checks rate limits (maximum 5 failed attempts in 15 minutes).
3. **Platform Login** (`loginMode === 'platform'`):
   - Queries `users` where `email = $1`.
   - Rejects if role is not `PLATFORM_ADMIN`.
   - Performs a bcrypt comparison of password against `password_hash`.
   - Saves session data: `role = 'PLATFORM_ADMIN'`, `tenantId`, `userId`.
   - Redirects to `/hq`.
4. **School Staff Login** (otherwise):
   - Validates that `schoolCode` is provided.
   - Looks up tenant by school code (`SELECT tenant_id FROM tenants WHERE code = $1`).
   - Looks up the user under that tenant: `SELECT id, role, password_hash, is_active FROM users WHERE email = $1 AND tenant_id = $2`.
   - Performs bcrypt comparison.
   - Creates session with tenant info, child modules list, and user details.
   - Redirects based on role:
     * `PARENT` -> `/overview`
     * `STUDENT` -> `/profile`
     * Others (Admin, Teacher) -> `/dashboard`

---

## 5. E2E Test Structures, Assertions & DB Query Helpers

From reviewing `apps/web/e2e/migrated-modules.spec.ts` and `smoke.spec.ts`:
* **Auth Helper**: Tests call auth helper functions `loginAsTeacher(page)`, `loginAsAdmin(page)`, or `loginAsParent(page)` before executing navigations. These functions navigate to `/login`, fill email/password fields, press the login button, and wait for redirects (`/dashboard` or `/overview`).
* **Database Queries**: E2E tests run direct SQL queries on the active PostgreSQL instance using the `runQuery` wrapper. It instantiates a PG pool using `process.env.DATABASE_URL` with a low connection capacity (`max: 1`) and short idle timeout to avoid leaving open connections.
* **Assertions**: Playwright's `expect` assertions (e.g. `expect(page.locator(...)).toBeVisible()`, `expect(page.locator(...)).toContainText(...)`) are used extensively to confirm that UI lists render live records.

---

## 6. Playwright E2E Test Scenarios (60 Scenarios)

### Tier 1: Happy Path Feature Coverage (25 Scenarios - 5 per module)

#### A. Hostel Module
1. **E2E-HS-101: Verify Hostel Dashboard KPI Cards**
   * *Flow*: Log in as Admin -> Navigate to `/hostel` -> Assert page header reads "Hostel Management" -> Verify visibility of stats cards ("Total Hostels", "Total Beds", "Occupied", "Available", "Occupancy").
2. **E2E-HS-102: View Active Allocations Table**
   * *Flow*: Log in as Admin -> Navigate to `/hostel` -> Locate "Active Allocations" table -> Verify columns (Student, Hostel, Room, Bed, Period) are rendered and populated with data.
3. **E2E-HS-103: Filter Hostel Fees by Status Paid**
   * *Flow*: Log in as Admin -> Navigate to `/hostel/fees` -> Select "Paid" in status filter dropdown -> Assert that all rendered rows display the green badge containing "paid".
4. **E2E-HS-104: Filter Hostel Fees by Fee Type Mess**
   * *Flow*: Log in as Admin -> Navigate to `/hostel/fees` -> Select "Mess Fee" in type dropdown -> Assert that only rows with the purple badge containing "mess" are displayed.
5. **E2E-HS-105: Clear Hostel Fees Filters**
   * *Flow*: Log in as Admin -> Navigate to `/hostel/fees` -> Set status filter to "Paid" -> Click "Clear" button -> Assert status filter resets to empty and the full record list is loaded.

#### B. Transport Module
6. **E2E-TR-101: View Configured Routes List**
   * *Flow*: Log in as Admin -> Navigate to `/transport` -> Assert route cards are visible -> Verify each card shows name, vehicle number, stops, student count, and monthly fee.
7. **E2E-TR-102: Open Create Route Form**
   * *Flow*: Log in as Admin -> Navigate to `/transport` -> Click "+ Add Route" -> Assert redirection to `/transport/new` -> Verify form fields are visible.
8. **E2E-TR-103: Cancel Route Creation**
   * *Flow*: Log in as Admin -> Navigate to `/transport/new` -> Click "Cancel" button -> Assert URL is redirected back to `/transport`.
9. **E2E-TR-104: Parent Portal My Transport Assigned View**
   * *Flow*: Log in as Parent -> Navigate to `/my-transport` -> Assert assigned route card details match children’s route assignment (stops and morning/afternoon timings are visible).
10. **E2E-TR-105: Verify Empty Routes Placeholder**
    * *Flow*: Delete all routes from DB using `runQuery` -> Log in as Admin -> Navigate to `/transport` -> Verify container displays bus icon and text "No routes configured yet."

#### C. Timetable Module
11. **E2E-TT-101: View Timetable Section Dashboard**
    * *Flow*: Log in as Admin -> Navigate to `/timetable` -> Assert that grade groups are displayed -> Verify links for sections are visible and clickable.
12. **E2E-TT-102: Load Substitution Dashboard Statistics**
    * *Flow*: Log in as Admin -> Navigate to `/timetable/substitution` -> Verify that the four KPI cards (Today's, Pending, Absent, Available) are displayed with correct counts.
13. **E2E-TT-103: Open Create Substitution Dialog**
    * *Flow*: Log in as Admin -> Navigate to `/timetable/substitution` -> Click "New Substitution" -> Assert that the dialog modal header reads "Create Substitution Request".
14. **E2E-TT-104: View Absent Teachers list**
    * *Flow*: Set teacher `is_active` to false in DB -> Log in as Admin -> Navigate to `/timetable/substitution` -> Locate "Absent Teachers Today" card -> Assert teacher name is listed.
15. **E2E-TT-105: Timetable Grid Placeholder Check**
    * *Flow*: Log in as Admin -> Navigate to `/timetable` -> Click "Grid View" -> Verify timetable days (Monday-Saturday) and periods are displayed -> Assert that placeholder note card at bottom is visible.

#### D. Library Module
16. **E2E-LB-101: View Books Catalog table**
    * *Flow*: Log in as Admin -> Navigate to `/library` -> Assert books table is displayed -> Verify columns (Title, Author, ISBN, Category, Location, Available) render details.
17. **E2E-LB-102: Switch Library Issue/Return Modes**
    * *Flow*: Log in as Admin -> Navigate to `/library/issue` -> Click "Return Book" -> Assert "Currently Issued Books" table is shown -> Click "Issue Book" -> Assert issue book card forms are shown.
18. **E2E-LB-103: Catalog Search Filtering**
    * *Flow*: Log in as Admin -> Navigate to `/library/issue` -> Type book title keyword in search bar -> Verify that the book dropdown lists only books matching the keyword.
19. **E2E-LB-104: Issue Book Form Submission**
    * *Flow*: Log in as Admin -> Navigate to `/library/issue` -> Select available book and student -> Click "Issue Book" button -> Assert success banner containing "successfully issued" is displayed.
20. **E2E-LB-105: Return Book Form Submission**
    * *Flow*: Log in as Admin -> Navigate to `/library/issue` -> Switch to Return mode -> Locate issued book -> Click "Return" action -> Assert success banner containing "returned successfully" is displayed.

#### E. Inventory Module
21. **E2E-IN-101: View Assets Log**
    * *Flow*: Log in as Admin -> Navigate to `/inventory` -> Verify "Assets" table lists serial numbers, categories, locations, condition tags, and purchase values.
22. **E2E-IN-102: View Consumables Log**
    * *Flow*: Log in as Admin -> Navigate to `/inventory` -> Verify "Consumables" table displays current stock, unit, minimum stock, and supplier.
23. **E2E-IN-103: View Inventory Alert Dashboard**
    * *Flow*: Log in as Admin -> Navigate to `/inventory` -> Verify KPI stats (Total Assets, Asset Value, Low Stock Items, Active Alerts) match records.
24. **E2E-IN-104: View Reorder Suggestions**
    * *Flow*: Log in as Admin -> Navigate to `/inventory/alerts` -> Verify table of "Reorder Suggestions" displays suggested quantities for items below reorder levels.
25. **E2E-IN-105: Filter Stock Alerts by Severity**
    * *Flow*: Log in as Admin -> Navigate to `/inventory/alerts` -> Click "Critical" card -> Verify stock alerts are filtered to critical items only.

---

### Tier 2: Boundary & Corner Cases (25 Scenarios - 5 per module)

#### A. Hostel Module
26. **E2E-HS-201: Fee List Empty Filter Combination**
    * *Flow*: Log in as Admin -> Navigate to `/hostel/fees` -> Select status "overdue" and fee type "caution" -> Verify table renders placeholder message "No fee records found.".
27. **E2E-HS-202: Unauthenticated User Redirection**
    * *Flow*: Clear all cookies -> Navigate directly to `/hostel` -> Assert browser is redirected to `/login`.
28. **E2E-HS-203: Access Restricted for Parent Role**
    * *Flow*: Log in as Parent -> Navigate directly to `/hostel` -> Assert URL redirects to `/unauthorized`.
29. **E2E-HS-204: Zero Allocation KPI calculation**
    * *Flow*: Clear all allocations in DB -> Log in as Admin -> Navigate to `/hostel` -> Assert occupancy rate KPI card displays "0%".
30. **E2E-HS-205: View Mess Menu Day sorting boundary**
    * *Flow*: Log in as Admin -> Navigate to `/hostel` -> Trigger mess menu fetch -> Assert day entries are sorted starting from Monday, ending on Sunday.

#### B. Transport Module
31. **E2E-TR-201: Route Create Input Validations**
    * *Flow*: Log in as Admin -> Navigate to `/transport/new` -> Leave inputs empty -> Verify that form fields flag required parameters or submit is blocked.
32. **E2E-TR-202: Unassigned Parent Transport View**
    * *Flow*: Ensure student has no assigned route -> Log in as Parent -> Navigate to `/my-transport` -> Assert card displays "No transport assigned.".
33. **E2E-TR-203: Invalid Route Details Parameter handling**
    * *Flow*: Log in as Admin -> Navigate to `/transport/non-existent-uuid` -> Assert page renders default layout or throws redirect to `/transport` rather than server crash.
34. **E2E-TR-204: Transport Route Access Restricted for Teacher Role**
    * *Flow*: Log in as Teacher -> Navigate to `/transport` -> Assert browser redirects to `/unauthorized`.
35. **E2E-TR-205: Driver phone format inputs validation**
    * *Flow*: Log in as Admin -> Navigate to `/transport/new` -> Type non-numeric characters in phone field -> Verify field warns of invalid characters or blocks formatting.

#### C. Timetable Module
36. **E2E-TT-201: Substitution Form validation error on empty submit**
    * *Flow*: Log in as Admin -> Navigate to `/timetable/substitution` -> Open modal -> Click "Create Request" -> Assert validation error/block keeps dialog visible.
37. **E2E-TT-202: Dialog missing subject validation**
    * *Flow*: Log in as Admin -> Navigate to `/timetable/substitution` -> Open modal -> Select teacher but leave subject empty -> Click "Create Request" -> Assert dialog remains open.
38. **E2E-TT-203: Timetable Entry Teacher Double-Booking Check**
    * *Flow*: Trigger `createTimetableEntry` via action simulator with a teacher already busy -> Assert output contains conflict array with type `TEACHER_DOUBLE_BOOKED`.
39. **E2E-TT-204: Timetable Entry Room Double-Booking Check**
    * *Flow*: Trigger `createTimetableEntry` via action simulator with a room already occupied -> Assert output contains conflict array with type `ROOM_DOUBLE_BOOKED`.
40. **E2E-TT-205: Substitution details invalid id routing**
    * *Flow*: Log in as Admin -> Navigate to `/timetable/substitution/detail/invalid-id` -> Assert page handles redirect gracefully without unhandled exceptions.

#### D. Library Module
41. **E2E-LB-201: Issue book blocks empty book select**
    * *Flow*: Log in as Admin -> Navigate to `/library/issue` -> Select a student but no book -> Click "Issue Book" -> Assert error message "Please select both book and student." is displayed.
42. **E2E-LB-202: Issue book blocks empty student select**
    * *Flow*: Log in as Admin -> Navigate to `/library/issue` -> Select a book but no student -> Click "Issue Book" -> Assert error message "Please select both book and student." is displayed.
43. **E2E-LB-203: Search box keyword returns no matching catalog titles**
    * *Flow*: Log in as Admin -> Navigate to `/library/issue` -> Type garbage string in search -> Assert book selection dropdown displays only "Select a book..." and has no valid option.
44. **E2E-LB-204: Issue book blocks student with missing user account**
    * *Flow*: Remove `user_id` from student in DB -> Log in as Admin -> Navigate to `/library/issue` -> Select student -> Click "Issue" -> Assert error banner "No user account found..." is shown.
45. **E2E-LB-205: Borrowing history filters search with zero matches**
    * *Flow*: Log in as Admin -> Navigate to `/library/history` -> Type garbage search -> Click "Search" -> Assert table displays message "No borrowing records found.".

#### E. Inventory Module
46. **E2E-IN-201: Consumable low-stock red background indicator**
    * *Flow*: Set a consumable current stock less than minimum stock in DB -> Log in as Admin -> Navigate to `/inventory` -> Locate the item row -> Assert row has CSS class `bg-red-50` and stock text has class `text-red-600`.
47. **E2E-IN-202: Stock Alerts empty alert dashboard**
    * *Flow*: Mark all stock alerts as resolved in DB -> Log in as Admin -> Navigate to `/inventory/alerts` -> Assert "Active Alerts" card displays "✅ No alerts".
48. **E2E-IN-203: Asset condition tag fallback check**
    * *Flow*: Add an asset with condition "UNKNOWN" in DB -> Log in as Admin -> Navigate to `/inventory` -> Verify the row renders condition as "UNKNOWN" with a fallback badge.
49. **E2E-IN-204: Unauthenticated access block on alerts route**
    * *Flow*: Clear session cookies -> Navigate to `/inventory/alerts` -> Assert browser is redirected to `/login`.
50. **E2E-IN-205: Alerts access rejected for Parent role**
    * *Flow*: Log in as Parent -> Navigate to `/inventory/alerts` -> Assert browser redirects to `/unauthorized`.

---

### Tier 3: Cross-Feature Integration Tests (5 Scenarios)

51. **E2E-COM-301: Hostel Room Allocation triggers Hostel Fee Creation**
    * *Flow*: Log in as Admin -> Navigate to `/hostel` -> Allocate a student to a room -> Verify room occupancy increments in DB -> Navigate to `/hostel/fees` -> Verify a pending hostel fee entry is automatically generated for the student.
52. **E2E-COM-302: Student Transport route assignment integrates transport fee**
    * *Flow*: Assign student to route in transport -> Assert invoice is generated for parent -> Log in as Parent -> Verify invoice with fee corresponding to route's `monthlyFee` is visible.
53. **E2E-COM-303: Timetable Substitution Request approval updates teacher schedule**
    * *Flow*: Log in as Admin -> Navigate to `/timetable/substitution` -> Create substitution request -> Approve request -> Log in as Substitute Teacher -> Verify timetable schedules reflect the new assigned class hour.
54. **E2E-COM-304: Library Overdue return triggers unpaid fine addition**
    * *Flow*: Set an issue return date to be 5 days past due date in DB -> Navigate to `/library/history` -> Verify status is "OVERDUE" and fine is dynamic -> Return book -> Verify fine is added to the student's outstanding fees.
55. **E2E-COM-305: Inventory Asset condition change triggers Maintenance notification**
    * *Flow*: Log in as Admin -> Navigate to `/inventory` -> Change asset condition to `NEEDS_REPAIR` -> Verify that a maintenance request is triggered or a warning is raised in alerts feed.

---

### Tier 4: Real-World Workload Scenarios (5 Scenarios)

56. **E2E-WRK-401: Hostel Vacating & Waitlist Reallocation workflow**
    * *Flow*: Log in as Admin -> Navigate to `/hostel` -> Click "Vacate" on student allocation -> Assert room occupancy decrements -> Select new student from waitlist -> Allocate to the vacant bed -> Assert hostel occupancy metrics are correct.
57. **E2E-WRK-402: Start-of-Day Absenteeism Substitution routing**
    * *Flow*: Log in as Admin -> Navigate to `/timetable/substitution` -> Review list of absent teachers -> Create substitution requests for each period -> Assign available suggested teachers -> Assert substitution requests table updates to show substitute names.
58. **E2E-WRK-403: Monthly Library Overdue Audit & Fine Recovery loop**
    * *Flow*: Log in as Admin -> Run overdue audit -> Retrieve list of borrowers -> Navigate to `/library/issue` -> Process returns -> Verify books available counts increment -> Assert outstanding fines decrease on recovery.
59. **E2E-WRK-404: End-of-Term Inventory Asset Auditing & Restock**
    * *Flow*: Log in as Admin -> Navigate to `/inventory` -> Update condition of damaged computers to `DISPOSED` -> Navigate to alerts page -> Audit low stock consumables -> Trigger restock action -> Verify counts update and alerts clear.
60. **E2E-WRK-405: New Term Class Period Schedule Bulk Uploading**
    * *Flow*: Log in as Admin -> Run timetable bulk setup -> Import bulk list of section-period mappings -> Identify double-booked teacher conflict warnings -> Adjust conflicts -> Finalize timetable -> Verify grid view updates.
