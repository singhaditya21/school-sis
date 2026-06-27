# E2E Test Plan: School SIS Migrated Modules (4-Tier Compliance)

## Target Modules & Features
1. **Gradebook** (`/teacher/gradebook`): Selection, Marks Entry, Analytics, Relative Curve, Publish Grades.
2. **Hostel Fees** (`/hostel/fees`): Stat cards, Status filtering, Type filtering, Clear filters, Collect/Remind actions.
3. **Timetable Substitution** (`/timetable/substitution`): Stat cards, Absent list, Substitution Request dialog, Available substitutes list, Submit request.
4. **Library** (`/library/issue` & `/library/history`): Issue/Return mode toggle, Book search, Student selection, Confirm issue, Issue list, Return book action.
5. **Diary & Appointments** (`/diary` & `/appointments`): Diary entries listing, New entry trigger, Appointments listing, Status badge styling, New appointment trigger.

---

## 4-Tier Test Cases

### Tier 1: Feature Coverage (5 per feature, total 25)

#### 1. Gradebook
- **E2E-GB-T1-01**: Load Gradebook page and verify header & initial "No Class Selected" view.
- **E2E-GB-T1-02**: Select class and subject, and verify Continuous Assessment Matrix table loads with student rows.
- **E2E-GB-T1-03**: Verify Class Analytics cards (Class Average, Standard Deviation, Highest/Lowest Marks) are populated.
- **E2E-GB-T1-04**: Apply Relative Grading curve (Z-score calculation) and check updated grades.
- **E2E-GB-T1-05**: Click "Publish Final Grades" and verify success notification.

#### 2. Hostel Fees
- **E2E-HF-T1-01**: Load Hostel Fees page and check overall stat cards (Total Collected, Total Outstanding, etc.).
- **E2E-HF-T1-02**: Filter fee records by status "Paid" and verify list contains only paid records.
- **E2E-HF-T1-03**: Filter fee records by status "Unpaid/Overdue" and verify list.
- **E2E-HF-T1-04**: Filter fee records by fee type (e.g. "Mess", "Rent", "Caution") and verify list.
- **E2E-HF-T1-05**: Clear status and type filters and verify all records are restored.

#### 3. Timetable Substitution
- **E2E-TS-T1-01**: Load Substitution page and verify today's statistics cards (Substitutions, Absent teachers).
- **E2E-TS-T1-02**: Verify list of absent teachers for today is correctly displayed.
- **E2E-TS-T1-03**: Click "New Substitution Request" and verify modal opens.
- **E2E-TS-T1-04**: In modal, select absent teacher, class, period, and view list of available substitutes.
- **E2E-TS-T1-05**: Submit new request and verify it appears in the active substitutions table.

#### 4. Library Management
- **E2E-LIB-T1-01**: Toggle between "Issue Book" and "Return Book" modes on `/library/issue`.
- **E2E-LIB-T1-02**: Search for a book by title or ISBN.
- **E2E-LIB-T1-03**: Select a student from the dropdown for book issuance.
- **E2E-LIB-T1-04**: Click "Issue Book" and verify success message.
- **E2E-LIB-T1-05**: Under "Return Book" mode, locate issued books and click "Return".

#### 5. Diary & Appointments
- **E2E-DA-T1-01**: Load School Diary and verify homework/announcements list is displayed.
- **E2E-DA-T1-02**: Click "New Entry" and verify diary creation dialog opens.
- **E2E-DA-T1-03**: Load Appointments and verify list of meetings is displayed.
- **E2E-DA-T1-04**: Verify correct status badge color for appointments (e.g. scheduled = blue, completed = green).
- **E2E-DA-T1-05**: Click "New Appointment" and check dialog opens.

---

### Tier 2: Boundary & Corner Cases (5 per feature, total 25)

#### 1. Gradebook
- **E2E-GB-T2-01**: Access Gradebook page with invalid UUIDs for class or subject, verify it handles gracefully.
- **E2E-GB-T2-02**: Try to enter out-of-bound marks (e.g. negative or >100) in grading inputs, verify rejection.
- **E2E-GB-T2-03**: Gradebook page loading for a class with no registered students (empty matrix state).
- **E2E-GB-T2-04**: Gradebook relative grading calculation when all students have the same mark (Standard Deviation = 0).
- **E2E-GB-T2-05**: Load gradebook for non-existent subject, verify error/empty UI handled gracefully.

#### 2. Hostel Fees
- **E2E-HF-T2-01**: Filter combinations that return zero records, verify "No fee records found" empty state.
- **E2E-HF-T2-02**: Check fee collection modal for payment amount that is zero or negative.
- **E2E-HF-T2-03**: Verify overdue status styling and late fine calculations at boundary dates.
- **E2E-HF-T2-04**: Check that a student with no hostel assignment does not show up in hostel fees table.
- **E2E-HF-T2-05**: Set filters, refresh page, verify that filter state is cleared or handled gracefully.

#### 3. Timetable Substitution
- **E2E-TS-T2-01**: Try to create a substitution request with missing required fields, verify validation warnings.
- **E2E-TS-T2-02**: Search for available substitutes when all teachers in the department are busy, verify empty substitute list.
- **E2E-TS-T2-03**: Substitution request for a period index that is out of bounds (e.g. period 0 or negative).
- **E2E-TS-T2-04**: Double-booking prevention: attempt to assign a substitute who is already scheduled for that period.
- **E2E-TS-T2-05**: Cancel an active substitution request and check if the substitute is released back to the available pool.

#### 4. Library Management
- **E2E-LIB-T2-01**: Attempt to issue a book when no copies are left (available copies = 0), verify issue is disabled/blocked.
- **E2E-LIB-T2-02**: Search with special characters in title/ISBN and verify search handles it without breaking.
- **E2E-LIB-T2-03**: Issue book with no student selected, verify form validation blocks submission.
- **E2E-LIB-T2-04**: Dynamic fine calculation: check dynamic fine for a book returned past its due date (₹5 per day).
- **E2E-LIB-T2-05**: Attempt to return a book that has already been returned, check UI handling.

#### 5. Diary & Appointments
- **E2E-DA-T2-01**: Create diary entry with empty title/description and verify front-end validation.
- **E2E-DA-T2-02**: Create diary entry with maximum allowed characters (text boundary limits).
- **E2E-DA-T2-03**: Request appointment with date in the past, verify datepicker validation or error handling.
- **E2E-DA-T2-04**: View appointments list when there are no scheduled meetings, check empty state.
- **E2E-DA-T2-05**: Create appointment with overlapping time for same teacher/parent, check warning/error behavior.

---

### Tier 3: Cross-Feature Combinations (N = 5 cases)
- **E2E-COM-01**: Library Issue & Return Flow to History: Issue a book to a student, verify it appears in "Currently Issued Books" under Return mode, then verify it is listed in "Borrowing History" with status "ISSUED".
- **E2E-COM-02**: Timetable Substitution Schedule Sync: Create a new substitution request, approve it, and verify that the substitute teacher's schedule is updated.
- **E2E-COM-03**: Gradebook Publish to Diary Announcement: Teacher enters exam scores in Gradebook, publishes final grades, and then records a Diary entry announcing the grade release to the parents/students.
- **E2E-COM-04**: Hostel Fee Collection & Audit Sync: Collect a hostel fee from the Hostel page, and verify that the transaction is recorded in the global billing/invoice ledger.
- **E2E-COM-05**: Student Library Block on Outstanding Fees: If a student has unpaid overdue hostel fees, check if a warning is displayed or block is enforced when attempting to issue a library book.

---

### Tier 4: Real-World Workload Scenarios (5 cases)
- **E2E-WRK-01: Teacher End-of-Term Grading Workflow**: Teacher logs in, navigates to Gradebook, selects a class/subject, enters exam scores for students, applies relative bell curve grading to adjust marks, publishes final grades, then records a Diary entry announcing grades are published.
- **E2E-WRK-02: Library Lending & Return Lifecycle**: Librarian issues a textbook to a student, checks history to confirm checkout, simulates/records return of the book, and checks history to verify fine calculation and return status.
- **E2E-WRK-03: Teacher Absence & Substitution Resolution**: Principal views today's absent list, selects a teacher, clicks "+ New Substitution", fills in details, selects an available substitute from the automatically matching list, submits request, and checks that the substitution is listed under active requests.
- **E2E-WRK-04: Parent Portal Overview and Fee Payment**: Parent logs in, views child overview card showing fee stats, navigates to Hostel/School fees, selects pending invoice, opens payment dialog, enters payment details, completes transaction, and verifies receipt generation and paid status update.
- **E2E-WRK-05: School Diary & Parent Appointment Scheduling**: Parent logs in, reads new diary entry homework assignments, realizes student needs extra help, navigates to Appointments, requests a meeting with the teacher, and verifies the appointment appears as "scheduled" with proper badge styling.
