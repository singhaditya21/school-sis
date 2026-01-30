/**
 * Complete E2E Test Suite for School SIS
 * 
 * These tests cover all major user workflows using Playwright.
 * Run with: npx playwright test
 */

import { test, expect, Page } from '@playwright/test';

// ==================== AUTHENTICATION ====================
test.describe('Authentication & Authorization', () => {
    test('E2E-AUTH-001: Admin login and dashboard access', async ({ page }) => {
        await page.goto('/login');

        // Fill login form
        await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'admin123');
        await page.click('[data-testid="login-button"]');

        // Should redirect to dashboard
        await page.waitForURL('/dashboard');
        await expect(page.locator('h1')).toContainText('Dashboard');

        // Should show admin sidebar
        await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
        await expect(page.locator('text=Students')).toBeVisible();
        await expect(page.locator('text=Fees')).toBeVisible();
        await expect(page.locator('text=Exams')).toBeVisible();
    });

    test('E2E-AUTH-002: Invalid credentials shows error', async ({ page }) => {
        await page.goto('/login');

        await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'wrongpassword');
        await page.click('[data-testid="login-button"]');

        // Should show error
        await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    });

    test('E2E-AUTH-003: Logout clears session', async ({ page }) => {
        // Login first
        await loginAsAdmin(page);

        // Logout
        await page.click('[data-testid="user-menu"]');
        await page.click('text=Logout');

        // Should redirect to login
        await page.waitForURL('/login');

        // Try accessing protected route
        await page.goto('/dashboard');
        await page.waitForURL(/login/);
    });

    test('E2E-AUTH-004: Role-based access control', async ({ page }) => {
        // Login as parent
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'parent@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'parent123');
        await page.click('[data-testid="login-button"]');

        // Should redirect to parent portal
        await page.waitForURL('/overview');

        // Try accessing admin route
        await page.goto('/dashboard');
        await expect(page.locator('text=Access Denied')).toBeVisible();
    });
});

// ==================== STUDENT MANAGEMENT ====================
test.describe('Student Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('E2E-STU-001: Create new student', async ({ page }) => {
        await page.goto('/students/new');

        // Fill student form
        await page.fill('[data-testid="firstName"]', 'Test');
        await page.fill('[data-testid="lastName"]', 'Student');
        await page.fill('[data-testid="dob"]', '2012-05-15');
        await page.selectOption('[data-testid="gender"]', 'MALE');
        await page.selectOption('[data-testid="class"]', '10');
        await page.selectOption('[data-testid="section"]', 'A');
        await page.fill('[data-testid="parentPhone"]', '9876543210');

        // Submit
        await page.click('[data-testid="submit-btn"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('created');

        // Should show admission number
        await expect(page.locator('[data-testid="admission-number"]')).toBeVisible();
    });

    test('E2E-STU-002: Search students', async ({ page }) => {
        await page.goto('/students');

        // Search by name
        await page.fill('[data-testid="search-input"]', 'Aarav');
        await page.press('[data-testid="search-input"]', 'Enter');

        // Should show filtered results
        await expect(page.locator('[data-testid="student-row"]').first()).toContainText('Aarav');
    });

    test('E2E-STU-003: View student profile', async ({ page }) => {
        await page.goto('/students');

        // Click on first student
        await page.click('[data-testid="student-row"]:first-child');

        // Should show profile
        await expect(page.locator('[data-testid="student-name"]')).toBeVisible();
        await expect(page.locator('[data-testid="admission-number"]')).toBeVisible();
        await expect(page.locator('[data-testid="class-section"]')).toBeVisible();
    });

    test('E2E-STU-004: Promote students', async ({ page }) => {
        await page.goto('/students/promotion');

        // Select source class
        await page.selectOption('[data-testid="source-class"]', '9-A');

        // Wait for students to load
        await expect(page.locator('[data-testid="student-checkbox"]').first()).toBeVisible();

        // Select all students
        await page.click('[data-testid="select-all"]');

        // Select target class
        await page.selectOption('[data-testid="target-class"]', '10-A');

        // Promote
        await page.click('[data-testid="promote-btn"]');

        // Confirm
        await page.click('[data-testid="confirm-promotion"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('promoted');
    });
});

// ==================== ATTENDANCE ====================
test.describe('Attendance Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTeacher(page);
    });

    test('E2E-ATT-001: Mark daily attendance', async ({ page }) => {
        await page.goto('/teacher/attendance');

        // Select class
        await page.selectOption('[data-testid="class-select"]', '10-A');

        // Wait for students
        await expect(page.locator('[data-testid="student-list"]')).toBeVisible();

        // Mark all present
        await page.click('[data-testid="mark-all-present"]');

        // Verify counts
        await expect(page.locator('[data-testid="present-count"]')).toContainText('30');

        // Mark one student absent
        await page.click('[data-testid="student-row"]:first-child [data-testid="absent-btn"]');

        // Verify counts updated
        await expect(page.locator('[data-testid="absent-count"]')).toContainText('1');

        // Submit
        await page.click('[data-testid="submit-attendance"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('saved');
    });

    test('E2E-ATT-002: View attendance report', async ({ page }) => {
        await page.goto('/teacher/attendance/reports');

        // Select class
        await page.selectOption('[data-testid="class-select"]', '10-A');

        // Select date range
        await page.fill('[data-testid="start-date"]', '2026-01-01');
        await page.fill('[data-testid="end-date"]', '2026-01-31');

        // Generate report
        await page.click('[data-testid="generate-report"]');

        // Should show report
        await expect(page.locator('[data-testid="attendance-report"]')).toBeVisible();
        await expect(page.locator('[data-testid="average-attendance"]')).toBeVisible();
    });
});

// ==================== FEES & PAYMENTS ====================
test.describe('Fee Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('E2E-FEE-001: Create fee structure', async ({ page }) => {
        await page.goto('/fees/plans/new');

        // Fill form
        await page.fill('[data-testid="plan-name"]', 'Class 10 Annual 2026-27');
        await page.selectOption('[data-testid="class-select"]', '10');

        // Add components
        await page.click('[data-testid="add-component"]');
        await page.fill('[data-testid="component-name-0"]', 'Tuition Fee');
        await page.fill('[data-testid="component-amount-0"]', '50000');

        await page.click('[data-testid="add-component"]');
        await page.fill('[data-testid="component-name-1"]', 'Lab Fee');
        await page.fill('[data-testid="component-amount-1"]', '5000');

        // Save
        await page.click('[data-testid="save-plan"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('created');
    });

    test('E2E-FEE-002: Generate invoices', async ({ page }) => {
        await page.goto('/invoices/generate');

        // Select class and fee plan
        await page.selectOption('[data-testid="class-select"]', '10-A');
        await page.selectOption('[data-testid="fee-plan"]', 'Class 10 Annual');
        await page.fill('[data-testid="due-date"]', '2026-04-30');

        // Generate
        await page.click('[data-testid="generate-invoices"]');

        // Confirm
        await page.click('[data-testid="confirm-generate"]');

        // Should show success with count
        await expect(page.locator('[data-testid="toast"]')).toContainText('generated');
    });

    test('E2E-FEE-003: Record payment', async ({ page }) => {
        await page.goto('/invoices');

        // Find pending invoice
        await page.click('[data-testid="filter-pending"]');

        // Click on first invoice
        await page.click('[data-testid="invoice-row"]:first-child');

        // Record payment
        await page.click('[data-testid="record-payment"]');
        await page.fill('[data-testid="payment-amount"]', '25000');
        await page.selectOption('[data-testid="payment-mode"]', 'CASH');
        await page.fill('[data-testid="payment-reference"]', 'Receipt #12345');

        // Save
        await page.click('[data-testid="save-payment"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('recorded');
    });
});

// ==================== EXAMINATIONS ====================
test.describe('Examination Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('E2E-EXAM-001: Create exam', async ({ page }) => {
        await page.goto('/exams/create');

        // Fill exam details
        await page.fill('[data-testid="exam-name"]', 'Mid-Term 2026');
        await page.selectOption('[data-testid="exam-type"]', 'MID_TERM');
        await page.fill('[data-testid="start-date"]', '2026-03-15');
        await page.fill('[data-testid="end-date"]', '2026-03-25');

        // Select classes
        await page.click('[data-testid="class-10"]');
        await page.click('[data-testid="class-9"]');

        // Add subjects
        await page.click('[data-testid="add-subject"]');
        await page.selectOption('[data-testid="subject-0"]', 'Mathematics');
        await page.fill('[data-testid="date-0"]', '2026-03-15');
        await page.fill('[data-testid="max-marks-0"]', '100');

        // Save
        await page.click('[data-testid="create-exam"]');

        // Should redirect to exam page
        await page.waitForURL(/exams\/[a-f0-9-]+/);
    });

    test('E2E-EXAM-002: Enter marks', async ({ page }) => {
        await page.goto('/exams');

        // Click on exam
        await page.click('[data-testid="exam-row"]:first-child');

        // Navigate to marks entry
        await page.click('[data-testid="enter-marks"]');
        await page.selectOption('[data-testid="class-select"]', '10-A');
        await page.selectOption('[data-testid="subject-select"]', 'Mathematics');

        // Wait for marks table
        await expect(page.locator('[data-testid="marks-table"]')).toBeVisible();

        // Enter marks for first 3 students
        await page.fill('[data-testid="marks-input-0"]', '85');
        await page.fill('[data-testid="marks-input-1"]', '92');
        await page.fill('[data-testid="marks-input-2"]', '78');

        // Verify auto-calculated grades
        await expect(page.locator('[data-testid="grade-0"]')).toContainText('A');

        // Save
        await page.click('[data-testid="save-marks"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('saved');
    });

    test('E2E-EXAM-003: Generate report cards', async ({ page }) => {
        await page.goto('/exams/report-cards');

        // Select exam and class
        await page.selectOption('[data-testid="exam-select"]', 'Mid-Term 2026');
        await page.selectOption('[data-testid="class-select"]', '10-A');

        // Generate
        await page.click('[data-testid="generate-report-cards"]');

        // Wait for generation
        await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();

        // Should show download link
        await expect(page.locator('[data-testid="download-link"]')).toBeVisible({ timeout: 30000 });
    });
});

// ==================== ADMISSIONS ====================
test.describe('Admissions', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('E2E-ADM-001: Create admission lead', async ({ page }) => {
        await page.goto('/admissions/new');

        // Fill lead form
        await page.fill('[data-testid="student-name"]', 'New Student');
        await page.fill('[data-testid="parent-name"]', 'Parent Name');
        await page.fill('[data-testid="phone"]', '9876543210');
        await page.fill('[data-testid="email"]', 'parent@example.com');
        await page.selectOption('[data-testid="grade-applied"]', '10');

        // Submit
        await page.click('[data-testid="create-lead"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('created');
        await expect(page.locator('[data-testid="enquiry-number"]')).toBeVisible();
    });

    test('E2E-ADM-002: Process admission application', async ({ page }) => {
        await page.goto('/admissions');

        // Find lead and click
        await page.click('[data-testid="lead-row"]:first-child');

        // Change stage to TEST
        await page.click('[data-testid="change-stage"]');
        await page.click('[data-testid="stage-TEST"]');
        await page.fill('[data-testid="stage-notes"]', 'Scheduled for entrance test');
        await page.click('[data-testid="confirm-stage"]');

        // Should update stage
        await expect(page.locator('[data-testid="current-stage"]')).toContainText('TEST');
    });

    test('E2E-ADM-003: Approve admission', async ({ page }) => {
        await page.goto('/admissions');

        // Filter by OFFER stage
        await page.click('[data-testid="filter-OFFER"]');

        // Click on application
        await page.click('[data-testid="lead-row"]:first-child');

        // Approve
        await page.click('[data-testid="approve-admission"]');
        await page.click('[data-testid="confirm-approval"]');

        // Should show student created
        await expect(page.locator('[data-testid="toast"]')).toContainText('enrolled');
        await expect(page.locator('[data-testid="admission-number"]')).toBeVisible();
    });
});

// ==================== LIBRARY MANAGEMENT ====================
test.describe('Library Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('E2E-LIB-001: Add new book', async ({ page }) => {
        await page.goto('/library');

        // Click add book
        await page.click('[data-testid="add-book"]');

        // Fill book details
        await page.fill('[data-testid="book-title"]', 'Introduction to Algorithms');
        await page.fill('[data-testid="book-author"]', 'Thomas H. Cormen');
        await page.fill('[data-testid="book-isbn"]', '978-0-262-03384-8');
        await page.selectOption('[data-testid="book-category"]', 'REFERENCE');
        await page.fill('[data-testid="total-copies"]', '10');
        await page.fill('[data-testid="location"]', 'A-3-15');

        // Save
        await page.click('[data-testid="save-book"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('added');
    });

    test('E2E-LIB-002: Issue book to student', async ({ page }) => {
        await page.goto('/library/issue');

        // Search book
        await page.fill('[data-testid="book-search"]', 'Mathematics');
        await page.click('[data-testid="book-result"]:first-child');

        // Search student
        await page.fill('[data-testid="student-search"]', 'Aarav');
        await page.click('[data-testid="student-result"]:first-child');

        // Set loan period
        await page.selectOption('[data-testid="loan-days"]', '14');

        // Issue
        await page.click('[data-testid="issue-book"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('issued');
    });

    test('E2E-LIB-003: Return book', async ({ page }) => {
        await page.goto('/library/history');

        // Find issued book
        await page.click('[data-testid="filter-issued"]');

        // Click return
        await page.click('[data-testid="issue-row"]:first-child [data-testid="return-btn"]');

        // Confirm return
        await page.click('[data-testid="confirm-return"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('returned');
    });
});

// ==================== PARENT PORTAL ====================
test.describe('Parent Portal', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsParent(page);
    });

    test('E2E-PAR-001: View child attendance', async ({ page }) => {
        await page.goto('/my-attendance');

        // Should show attendance summary
        await expect(page.locator('[data-testid="attendance-percentage"]')).toBeVisible();
        await expect(page.locator('[data-testid="present-count"]')).toBeVisible();
        await expect(page.locator('[data-testid="absent-count"]')).toBeVisible();

        // Should show calendar
        await expect(page.locator('[data-testid="attendance-calendar"]')).toBeVisible();
    });

    test('E2E-PAR-002: View child results', async ({ page }) => {
        await page.goto('/my-results');

        // Should show exam list
        await expect(page.locator('[data-testid="exam-card"]').first()).toBeVisible();

        // Click on exam
        await page.click('[data-testid="exam-card"]:first-child');

        // Should show marks
        await expect(page.locator('[data-testid="marks-table"]')).toBeVisible();
        await expect(page.locator('[data-testid="total-marks"]')).toBeVisible();
        await expect(page.locator('[data-testid="percentage"]')).toBeVisible();
    });

    test('E2E-PAR-003: Pay fees online', async ({ page }) => {
        await page.goto('/my-fees');

        // Should show pending invoices
        await expect(page.locator('[data-testid="pending-invoices"]')).toBeVisible();

        // Click pay now
        await page.click('[data-testid="pay-now-btn"]:first-child');

        // Should show payment modal
        await expect(page.locator('[data-testid="payment-modal"]')).toBeVisible();

        // Verify amount
        await expect(page.locator('[data-testid="amount-input"]')).toBeVisible();

        // Click pay
        await page.click('[data-testid="proceed-payment-btn"]');

        // Wait for payment simulation
        await expect(page.locator('text=Payment Successful')).toBeVisible({ timeout: 5000 });
    });
});

// ==================== TEACHER PORTAL ====================
test.describe('Teacher Portal', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTeacher(page);
    });

    test('E2E-TCH-001: View dashboard', async ({ page }) => {
        await page.goto('/teacher/dashboard');

        // Should show greeting
        await expect(page.locator('h1')).toContainText(/Good/);

        // Should show quick stats
        await expect(page.locator('[data-testid="classes-today"]')).toBeVisible();
        await expect(page.locator('[data-testid="pending-attendance"]')).toBeVisible();

        // Should show schedule
        await expect(page.locator('[data-testid="todays-schedule"]')).toBeVisible();
    });

    test('E2E-TCH-002: Enter gradebook marks', async ({ page }) => {
        await page.goto('/teacher/gradebook');

        // Select class and exam
        await page.selectOption('[data-testid="class-select"]', '10-A');
        await page.selectOption('[data-testid="exam-select"]', 'Mid-Term 2026');
        await page.selectOption('[data-testid="subject-select"]', 'Mathematics');

        // Wait for marks table
        await expect(page.locator('[data-testid="marks-table"]')).toBeVisible();

        // Enter marks
        await page.fill('[data-testid="marks-input-0"]', '85');
        await page.fill('[data-testid="marks-input-1"]', '92');

        // Save
        await page.click('[data-testid="save-marks"]');

        // Should show success
        await expect(page.locator('[data-testid="toast"]')).toContainText('saved');
    });
});

// ==================== ANALYTICS ====================
test.describe('Analytics Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('E2E-ANA-001: View attendance analytics', async ({ page }) => {
        await page.goto('/analytics/attendance');

        // Should show charts
        await expect(page.locator('[data-testid="attendance-chart"]')).toBeVisible();
        await expect(page.locator('[data-testid="trend-chart"]')).toBeVisible();

        // Should show summary stats
        await expect(page.locator('[data-testid="average-attendance"]')).toBeVisible();
    });

    test('E2E-ANA-002: View fee analytics', async ({ page }) => {
        await page.goto('/analytics/fees');

        // Should show collection stats
        await expect(page.locator('[data-testid="total-collected"]')).toBeVisible();
        await expect(page.locator('[data-testid="pending-amount"]')).toBeVisible();
        await expect(page.locator('[data-testid="collection-chart"]')).toBeVisible();
    });

    test('E2E-ANA-003: Export report', async ({ page }) => {
        await page.goto('/analytics');

        // Select report type
        await page.selectOption('[data-testid="report-type"]', 'ATTENDANCE');
        await page.fill('[data-testid="start-date"]', '2026-01-01');
        await page.fill('[data-testid="end-date"]', '2026-01-31');

        // Export
        const downloadPromise = page.waitForEvent('download');
        await page.click('[data-testid="export-excel"]');
        const download = await downloadPromise;

        // Should download file
        expect(download.suggestedFilename()).toContain('.xlsx');
    });
});

// ==================== HELPER FUNCTIONS ====================
async function loginAsAdmin(page: Page) {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

async function loginAsTeacher(page: Page) {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'teacher@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'teacher123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/teacher/dashboard');
}

async function loginAsParent(page: Page) {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'parent@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'parent123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/overview');
}
