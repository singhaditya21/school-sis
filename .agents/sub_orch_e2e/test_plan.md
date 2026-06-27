# E2E Test Plan: School SIS Migrated Modules

## Target Modules & Features
1. **Gradebook** (`/teacher/gradebook`): Selection, Marks Entry, Analytics, Relative Curve, Publish Grades.
2. **Hostel Fees** (`/hostel/fees`): Stat cards, Status filtering, Type filtering, Clear filters, Collect/Remind actions.
3. **Timetable Substitution** (`/timetable/substitution`): Stat cards, Absent list, Substitution Request dialog, Available substitutes list, Submit request.
4. **Library** (`/library/issue` & `/library/history`): Issue/Return mode toggle, Book search, Student selection, Confirm issue, Issue list, Return book action.
5. **Diary & Appointments** (`/diary` & `/appointments`): Diary entries listing, New entry trigger, Appointments listing, Status badge styling, New appointment trigger.

## 4-Tier Test Cases

### Tier 1: Feature Coverage (Happy Path)
#### Gradebook
- E2E-GB-001: Load gradebook page and verify header & initial "No Class Selected" view.
- E2E-GB-002: Select CS301 class and verify Continuous Assessment Matrix table load.
- E2E-GB-003: Check Class Analytics cards (Average, Std Dev, Highest, Failing) are populated.
- E2E-GB-004: Apply Relative Grading curve and verify relative grades are calculated (Z-score).
- E2E-GB-005: Click "Publish Final Grades" and verify success message.

#### Hostel Fees
- E2E-HF-001: Load Hostel Fees page and check overall stat cards (Total Collected, Pending, Overdue).
- E2E-HF-002: Filter fee records by status "paid" and verify list contains only paid records.
- E2E-HF-003: Filter fee records by type "mess" and verify list contains only mess records.
- E2E-HF-004: Clear filters and verify all records are restored.
- E2E-HF-005: Click "Collect" on a pending fee and verify payment modal/action.

#### Timetable Substitution
- E2E-TT-001: Load Substitution page and verify stat cards (Pending, Absent today, etc.).
- E2E-TT-002: Click "+ New Substitution" and verify dialog opens.
- E2E-TT-003: Fill in new substitution form with absent teacher, subject, period.
- E2E-TT-004: Verify list of available substitutes is displayed in the dialog.
- E2E-TT-005: Submit new request and verify it appears in the substitutions table.

#### Library Management
- E2E-LIB-001: Toggle between Issue and Return modes on `/library/issue`.
- E2E-LIB-002: Search for a book by title and select it.
- E2E-LIB-003: Select a student from the dropdown and issue the book.
- E2E-LIB-004: View currently issued books under Return tab.
- E2E-LIB-005: Click "Return" on a book and verify success notification.

#### Diary & Appointments
- E2E-DA-001: Load School Diary and verify homework/announcements list is displayed.
- E2E-DA-002: Click "+ New Entry" and check dialog/action.
- E2E-DA-003: Load Appointments and verify list of meetings is displayed.
- E2E-DA-004: Verify correct status badge color for appointments (e.g. scheduled = blue).
- E2E-DA-005: Click "+ New Appointment" and check dialog/action.

---

### Tier 2: Boundary & Corner Cases
- E2E-BND-001: Enter empty/invalid grades in Gradebook matrix (e.g. negative or alpha) and verify rejection.
- E2E-BND-002: Filter Hostel fees with status and type combinations that have no matching records (verify empty state).
- E2E-BND-003: Fill substitution request dialog with missing fields and verify validations block submission.
- E2E-BND-004: Attempt to issue book with no student selected (verify validation).
- E2E-BND-005: View overdue books on library history and verify dynamic fine calculations (₹5 per day).

---

### Tier 3: Cross-Feature Combinations
- E2E-COM-001: Issue book from Library, verify it appears in "Currently Issued Books" under Return mode, then verify it is listed in "Borrowing History" with "ISSUED" status.
- E2E-COM-002: Add new timetable substitution, approve it, and verify that the substitute teacher's schedule updates accordingly.

---

### Tier 4: Real-World Workload Scenarios
- E2E-WRK-001: Teacher end-of-term grading workflow: Teacher logs in, navigates to Gradebook, selects a class, enters exam scores for students, applies relative bell curve grading to adjust marks, publishes final grades, then records a Diary entry announcing grades are published.
- E2E-WRK-002: Library checkout and return cycle: Librarian issues a textbook to a student, checks history to confirm checkout, waits/simulates return date, records return of the book, and checks history to verify fine calculation and return status.
