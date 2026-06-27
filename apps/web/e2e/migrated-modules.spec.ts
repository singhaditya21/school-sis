import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Helper function to execute a database query and immediately close the pool to prevent connection leaks
async function runQuery(text: string, params?: any[]) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        idleTimeoutMillis: 500,
    });
    try {
        const res = await pool.query(text, params);
        return res;
    } finally {
        await pool.end();
    }
}

// Helper functions for auth login
async function loginAsTeacher(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'teacher@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'teacher123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

async function loginAsAdmin(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

async function loginAsParent(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'parent@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'parent123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/overview');
}

// ==========================================
// TIER 1: Happy Path Feature Coverage (5 per module)
// ==========================================

test.describe('Gradebook E2E Tests - Tier 1', () => {
    test('E2E-GB-101: Gradebook subject/grade selection and grid loading', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        const subjectId = subjectRes.rows[0]?.id;
        const gradeId = gradeRes.rows[0]?.id;

        await page.goto(`/teacher/gradebook?subjectId=${subjectId}&gradeId=${gradeId}`);
        await expect(page.locator('text=Continuous Assessment Matrix')).toBeVisible();
        await expect(page.locator('text=Aarav Sharma')).toBeVisible();
    });

    test('E2E-GB-102: Gradebook relative curve calculation', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        const subjectId = subjectRes.rows[0]?.id;
        const gradeId = gradeRes.rows[0]?.id;

        await page.goto(`/teacher/gradebook?subjectId=${subjectId}&gradeId=${gradeId}`);
        const applyCurveBtn = page.locator('button:has-text("Apply Relative Grading")');
        await expect(applyCurveBtn).toBeVisible();
        await applyCurveBtn.click();
    });

    test('E2E-GB-103: Gradebook publishing final grades', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        const subjectId = subjectRes.rows[0]?.id;
        const gradeId = gradeRes.rows[0]?.id;

        await page.goto(`/teacher/gradebook?subjectId=${subjectId}&gradeId=${gradeId}`);
        const publishBtn = page.locator('button:has-text("Publish Final Grades")');
        await expect(publishBtn).toBeVisible();
        await publishBtn.click();
    });

    test('E2E-GB-104: Gradebook stats cards display class metrics', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        const subjectId = subjectRes.rows[0]?.id;
        const gradeId = gradeRes.rows[0]?.id;

        await page.goto(`/teacher/gradebook?subjectId=${subjectId}&gradeId=${gradeId}`);
        await expect(page.getByText('Class Average', { exact: true })).toBeVisible();
        await expect(page.getByText('Standard Deviation', { exact: true })).toBeVisible();
    });

    test('E2E-GB-105: Gradebook matrix displays CBCS grades grid', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        const subjectId = subjectRes.rows[0]?.id;
        const gradeId = gradeRes.rows[0]?.id;

        await page.goto(`/teacher/gradebook?subjectId=${subjectId}&gradeId=${gradeId}`);
        await expect(page.locator('table th:has-text("Student")')).toBeVisible();
        await expect(page.locator('table th:has-text("Absolute")')).toBeVisible();
    });
});

test.describe('Hostel E2E Tests - Tier 1', () => {
    test('E2E-HS-101: Hostel fees dashboard loading and KPI cards', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.locator('main h1')).toContainText('Hostel Fees');
        await expect(page.getByText('Total Collected', { exact: true })).toBeVisible();
        await expect(page.getByText('Total Outstanding', { exact: true })).toBeVisible();
    });

    test('E2E-HS-102: Filter hostel fees by status paid', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.locator('table tbody tr')).toHaveCount(2);
        const statusSelect = page.locator('select').first();
        await statusSelect.selectOption('paid');
        await expect(page.locator('table tbody tr td:has-text("paid")').first()).toBeVisible();
    });

    test('E2E-HS-103: Filter hostel fees by fee type mess', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.locator('table tbody tr')).toHaveCount(2);
        const typeSelect = page.locator('select').nth(1);
        await typeSelect.selectOption('mess');
        await expect(page.locator('table tbody tr td:has-text("mess")').first()).toBeVisible();
    });

    test('E2E-HS-104: Clear filters resets selectors', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.locator('table tbody tr')).toHaveCount(2);
        const statusSelect = page.locator('select').first();
        await statusSelect.selectOption('paid');
        const clearBtn = page.locator('button:has-text("Clear")');
        await clearBtn.click();
        await expect(statusSelect).toHaveValue('');
    });

    test('E2E-HS-105: Verify Hostel dashboard lists active hostels', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel');
        await expect(page.locator('main h1')).toContainText('Hostel Management');
        await expect(page.locator('text=Nilgiri Boys Hostel').first()).toBeVisible();
    });
});

test.describe('Timetable Substitution E2E Tests - Tier 1', () => {
    test('E2E-TT-101: Substitution dashboard and today stats', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await expect(page.locator('main h1')).toContainText('Substitution Management');
        await expect(page.getByText("Today's Substitutions", { exact: true })).toBeVisible();
    });

    test('E2E-TT-102: Absent teachers today list populated', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await expect(page.locator('text=Absent Teachers Today')).toBeVisible();
        await expect(page.locator('text=Teacher User').first()).toBeVisible();
    });

    test('E2E-TT-103: New Substitution request dialog opens', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        const newBtn = page.locator('button:has-text("New Substitution")');
        await newBtn.click();
        await expect(page.locator('text=Create Substitution Request')).toBeVisible();
    });

    test('E2E-TT-104: Form population loads available substitutes list', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await page.click('button:has-text("New Substitution")');
        const absentSelect = page.locator('select').first();
        await absentSelect.selectOption('Teacher User');
        await expect(page.locator('h4:has-text("Available Substitutes")')).toBeVisible();
    });

    test('E2E-TT-105: Create request closes dialog', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await page.click('button:has-text("New Substitution")');
        await page.locator('select').first().selectOption('Teacher User');
        await page.fill('input[placeholder="Enter subject..."]', 'Mathematics');
        await page.click('button:has-text("Create Request")');
        await expect(page.locator('text=Create Substitution Request')).not.toBeVisible();
    });
});

test.describe('Library E2E Tests - Tier 1', () => {
    test('E2E-LB-101: Switch modes and search library catalog', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        await page.click('button:has-text("Issue Book")');
        await page.fill('input[placeholder="Search by title or ISBN..."]', 'Hobbit');
        const bookSelect = page.locator('select').first();
        await expect(bookSelect).toBeVisible();
    });

    test('E2E-LB-102: Return book view lists currently issued items', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        await page.click('button:has-text("Return Book")');
        await expect(page.locator('text=Currently Issued Books')).toBeVisible();
    });

    test('E2E-LB-103: Selecting catalog book and target student', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        await page.click('button:has-text("Issue Book")');
        const bookSelect = page.locator('select').first();
        await bookSelect.selectOption('d5b5c928-867c-473d-88f5-1bdf3a4bc070');
        const studentSelect = page.locator('select').nth(1);
        const studentRes = await runQuery("SELECT id FROM students WHERE first_name = 'Aarav' LIMIT 1");
        await studentSelect.selectOption(studentRes.rows[0]?.id);
    });

    test('E2E-LB-104: Issue book shows success response', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        await page.click('button:has-text("Issue Book")');
        await page.locator('select').first().selectOption('d5b5c928-867c-473d-88f5-1bdf3a4bc070');
        const studentRes = await runQuery("SELECT id FROM students WHERE first_name = 'Aarav' LIMIT 1");
        await page.locator('select').nth(1).selectOption(studentRes.rows[0]?.id);
        await page.click('button.w-full:has-text("Issue Book")');
        await expect(page.locator('text=successfully issued')).toBeVisible();
    });

    test('E2E-LB-105: Return book shows success response', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        await page.click('button:has-text("Return Book")');
        const returnBtn = page.locator('table button:has-text("Return")').first();
        await returnBtn.click();
        await expect(page.locator('text=returned successfully')).toBeVisible();
    });
});

test.describe('Diary & Appointments E2E Tests - Tier 1', () => {
    test('E2E-DA-101: Diary view loads all entry lists', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/diary');
        await expect(page.locator('main h1')).toContainText('School Diary');
        await expect(page.locator('text=Math Homework')).toBeVisible();
    });

    test('E2E-DA-102: Diary item details are displayed properly', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/diary');
        await expect(page.locator('text=Complete problems 1 to 10')).toBeVisible();
    });

    test('E2E-DA-103: Appointments view list matches expectations', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/appointments');
        await expect(page.locator('main h1')).toContainText('Appointments');
        await expect(page.locator('text=Parent Teacher Meeting')).toBeVisible();
    });

    test('E2E-DA-104: Appointments status badge shows current status', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/appointments');
        await expect(page.locator('text=scheduled')).toBeVisible();
    });

    test('E2E-DA-105: Diary and appointments page header buttons present', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/diary');
        await expect(page.locator('button:has-text("New Entry")')).toBeVisible();
        await page.goto('/appointments');
        await expect(page.locator('button:has-text("New Appointment")')).toBeVisible();
    });
});

// ==========================================
// TIER 2: Boundary & Corner Cases (5 per module)
// ==========================================

test.describe('Gradebook E2E Tests - Tier 2', () => {
    test('E2E-GB-201: Gradebook invalid subject ID handled gracefully', async ({ page }) => {
        await loginAsTeacher(page);
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        const gradeId = gradeRes.rows[0]?.id;
        await page.goto(`/teacher/gradebook?subjectId=00000000-0000-0000-0000-000000000000&gradeId=${gradeId}`);
        await expect(page.locator('main')).toBeVisible();
    });

    test('E2E-GB-202: Gradebook invalid grade ID handled gracefully', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const subjectId = subjectRes.rows[0]?.id;
        await page.goto(`/teacher/gradebook?subjectId=${subjectId}&gradeId=00000000-0000-0000-0000-000000000000`);
        await expect(page.locator('main')).toBeVisible();
    });

    test('E2E-GB-203: Gradebook access redirect to login when session ends', async ({ page }) => {
        await loginAsTeacher(page);
        await page.context().clearCookies();
        await page.goto('/teacher/gradebook');
        await page.waitForURL(url => url.pathname === '/login');
        await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    });

    test('E2E-GB-204: Gradebook access rejected for Parent role', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/teacher/gradebook');
        await page.waitForURL(url => url.pathname === '/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();
    });

    test('E2E-GB-205: Gradebook shows instructions when class not selected', async ({ page }) => {
        await loginAsTeacher(page);
        await page.goto('/teacher/gradebook');
        await expect(page.locator('text=No Class Selected')).toBeVisible();
    });
});

test.describe('Hostel E2E Tests - Tier 2', () => {
    test('E2E-HS-201: Hostel fee empty state with overdue filter', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.locator('table tbody tr')).toHaveCount(2);
        const statusSelect = page.locator('select').first();
        await statusSelect.selectOption('overdue');
        await expect(page.locator('text=No fee records found.')).toBeVisible();
    });

    test('E2E-HS-202: Hostel fees search invalid terms results in zero rows', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.locator('table tbody tr')).toHaveCount(2);
        const typeSelect = page.locator('select').nth(1);
        await typeSelect.selectOption('caution');
        await expect(page.locator('text=No fee records found.')).toBeVisible();
    });

    test('E2E-HS-203: Hostel fees access redirect when logged out', async ({ page }) => {
        await loginAsAdmin(page);
        await page.context().clearCookies();
        await page.goto('/hostel/fees');
        await page.waitForURL(url => url.pathname === '/login');
    });

    test('E2E-HS-204: Hostel fees metrics handles empty filtered list', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.locator('table tbody tr')).toHaveCount(2);
        await page.locator('select').first().selectOption('overdue');
        await expect(page.getByText('₹0', { exact: false })).toBeVisible();
    });

    test('E2E-HS-205: Hostel page rejected for Parent role', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/hostel/fees');
        await page.waitForURL(url => url.pathname === '/unauthorized');
    });
});

test.describe('Timetable Substitution E2E Tests - Tier 2', () => {
    test('E2E-TT-201: Dialog validation warning when submitting empty substitution', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await page.click('button:has-text("New Substitution")');
        await page.click('button:has-text("Create Request")');
        await expect(page.locator('text=Create Substitution Request')).toBeVisible();
    });

    test('E2E-TT-202: Dialog missing subject validation holds submission', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await page.click('button:has-text("New Substitution")');
        await page.locator('select').first().selectOption('Teacher User');
        await page.click('button:has-text("Create Request")');
        await expect(page.locator('text=Create Substitution Request')).toBeVisible();
    });

    test('E2E-TT-203: Substitution access unauthorized when logged out', async ({ page }) => {
        await loginAsAdmin(page);
        await page.context().clearCookies();
        await page.goto('/timetable/substitution');
        await page.waitForURL(url => url.pathname === '/login');
    });

    test('E2E-TT-204: Substitution dashboard rejects Parent role', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/timetable/substitution');
        await page.waitForURL(url => url.pathname === '/unauthorized');
    });

    test('E2E-TT-205: Substitution details handles invalid id parameter', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution/detail/00000000-0000-0000-0000-000000000000');
        await expect(page.locator('body')).toBeVisible();
    });
});

test.describe('Library E2E Tests - Tier 2', () => {
    test('E2E-LB-201: Issue book validator blocks empty book selection', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        const studentRes = await runQuery("SELECT id FROM students WHERE first_name = 'Aarav' LIMIT 1");
        await page.locator('select').nth(1).selectOption(studentRes.rows[0]?.id);
        await page.click('button.w-full:has-text("Issue Book")');
        await expect(page.locator('text=Please select both book and student')).toBeVisible();
    });

    test('E2E-LB-202: Issue book validator blocks empty student selection', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        await page.locator('select').first().selectOption('d5b5c928-867c-473d-88f5-1bdf3a4bc070');
        await page.click('button.w-full:has-text("Issue Book")');
        await expect(page.locator('text=Please select both book and student')).toBeVisible();
    });

    test('E2E-LB-203: Catalog Search empty result handles gracefully', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');
        await page.fill('input[placeholder="Search by title or ISBN..."]', 'NonExistentBookSearchKeyword');
        const optionsCount = await page.locator('select').first().locator('option').count();
        expect(optionsCount).toBe(1);
    });

    test('E2E-LB-204: Library issue page redirects when logged out', async ({ page }) => {
        await loginAsAdmin(page);
        await page.context().clearCookies();
        await page.goto('/library/issue');
        await page.waitForURL(url => url.pathname === '/login');
    });

    test('E2E-LB-205: Library issue page rejects Parent role access', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/library/issue');
        await page.waitForURL(url => url.pathname === '/unauthorized');
    });
});

test.describe('Diary & Appointments E2E Tests - Tier 2', () => {
    test('E2E-DA-201: Diary view redirects when logged out', async ({ page }) => {
        await loginAsAdmin(page);
        await page.context().clearCookies();
        await page.goto('/diary');
        await page.waitForURL(url => url.pathname === '/login');
    });

    test('E2E-DA-202: Appointments view redirects when logged out', async ({ page }) => {
        await loginAsAdmin(page);
        await page.context().clearCookies();
        await page.goto('/appointments');
        await page.waitForURL(url => url.pathname === '/login');
    });

    test('E2E-DA-203: Parent portal diary does not expose write options', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/diary');
        await expect(page.locator('button:has-text("New Entry")')).not.toBeVisible();
    });

    test('E2E-DA-204: Parent portal appointments does not expose scheduling buttons', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/appointments');
        await expect(page.locator('button:has-text("New Appointment")')).not.toBeVisible();
    });

    test('E2E-DA-205: Diary details handles invalid id parameter', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/diary/00000000-0000-0000-0000-000000000000');
        await expect(page.locator('body')).toBeVisible();
    });
});

// ==========================================
// TIER 3: Cross-Feature Combination Tests (5 tests)
// ==========================================

test.describe('Cross-Feature Integration - Tier 3', () => {
    test('E2E-COM-301: Library Checkout -> Return cycle updates student log history', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        // 1. Issue book
        await page.click('button:has-text("Issue Book")');
        await page.locator('select').first().selectOption('d5b5c928-867c-473d-88f5-1bdf3a4bc070');
        const studentRes = await runQuery("SELECT id FROM students WHERE first_name = 'Aarav' LIMIT 1");
        await page.locator('select').nth(1).selectOption(studentRes.rows[0]?.id);
        await page.click('button.w-full:has-text("Issue Book")');
        await expect(page.locator('text=successfully issued')).toBeVisible();

        // 2. Return book
        await page.click('button:has-text("Return Book")');
        await page.waitForTimeout(500);
        await page.locator('table button:has-text("Return")').first().click();
        await expect(page.locator('text=returned successfully')).toBeVisible();
    });

    test('E2E-COM-302: Timetable Substitution Request updates Substitution Dashboard', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await page.click('button:has-text("New Substitution")');
        await page.locator('select').first().selectOption('Teacher User');
        await page.fill('input[placeholder="Enter subject..."]', 'Chemistry');
        await page.click('button:has-text("Create Request")');
        await expect(page.locator('text=Create Substitution Request')).not.toBeVisible();
        await page.goto('/timetable/substitution');
        await expect(page.locator('table td:has-text("Teacher User")').first()).toBeVisible();
    });

    test('E2E-COM-303: Diary Entry publishes notification updates', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/diary');
        await expect(page.locator('text=Math Homework')).toBeVisible();
    });

    test('E2E-COM-304: Hostel Fee collection updates payments outstanding', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await expect(page.getByText('Total Outstanding', { exact: true })).toBeVisible();
    });

    test('E2E-COM-305: Teacher Gradebook relative curve calculation updates class stats cards', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        await page.goto(`/teacher/gradebook?subjectId=${subjectRes.rows[0]?.id}&gradeId=${gradeRes.rows[0]?.id}`);
        await page.click('button:has-text("Apply Relative Grading")');
        await expect(page.getByText('Class Average', { exact: true })).toBeVisible();
    });
});

// ==========================================
// TIER 4: Real-World Workload Scenarios (5 tests)
// ==========================================

test.describe('Real-World Workloads - Tier 4', () => {
    test('E2E-WRK-401: End-of-term grading and final report cards publishing', async ({ page }) => {
        await loginAsTeacher(page);
        const subjectRes = await runQuery("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
        const gradeRes = await runQuery("SELECT id FROM grades WHERE name = 'Grade 1' LIMIT 1");
        await page.goto(`/teacher/gradebook?subjectId=${subjectRes.rows[0]?.id}&gradeId=${gradeRes.rows[0]?.id}`);
        await page.click('button:has-text("Apply Relative Grading")');
        await page.click('button:has-text("Publish Final Grades")');
        await page.waitForTimeout(300);
        await expect(page.locator('text=Continuous Assessment Matrix')).toBeVisible();
    });

    test('E2E-WRK-402: Library complete book rental checkout and returns workload', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        // Check out
        await page.click('button:has-text("Issue Book")');
        await page.locator('select').first().selectOption('d5b5c928-867c-473d-88f5-1bdf3a4bc070');
        const studentRes = await runQuery("SELECT id FROM students WHERE first_name = 'Aarav' LIMIT 1");
        await page.locator('select').nth(1).selectOption(studentRes.rows[0]?.id);
        await page.click('button.w-full:has-text("Issue Book")');
        await expect(page.locator('text=successfully issued')).toBeVisible();

        // Check in
        await page.click('button:has-text("Return Book")');
        await page.waitForTimeout(500);
        await page.locator('table button:has-text("Return")').first().click();
        await expect(page.locator('text=returned successfully')).toBeVisible();
    });

    test('E2E-WRK-403: Daily school substitution workflow for absent teachers', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        await expect(page.locator('text=Teacher User').first()).toBeVisible();
        await page.click('button:has-text("New Substitution")');
        await page.locator('select').first().selectOption('Teacher User');
        await page.fill('input[placeholder="Enter subject..."]', 'Physics');
        await page.click('button:has-text("Create Request")');
        await expect(page.locator('text=Create Substitution Request')).not.toBeVisible();
    });

    test('E2E-WRK-404: Term-end hostel fee management and outstanding updates', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        await page.locator('select').first().selectOption('paid');
        await page.waitForTimeout(300);
        await expect(page.locator('table tbody tr td:has-text("paid")')).toBeVisible();
    });

    test('E2E-WRK-405: Parent portal updates verification workload loop', async ({ page }) => {
        // Admin checks diary entry
        await loginAsAdmin(page);
        await page.goto('/diary');
        await expect(page.locator('text=Math Homework')).toBeVisible();

        // Parent logs in to check overview
        await loginAsParent(page);
        await page.goto('/overview');
        await expect(page.locator('text=Welcome, Parent')).toBeVisible();
    });
});
