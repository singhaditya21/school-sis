import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

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
async function loginAsAdmin(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

async function loginAsTeacher(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'teacher@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'teacher123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

async function loginAsTeacher2(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'teacher2@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'teacher123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

async function setupDatabase() {
    // 1. Academic Year
    await runQuery(`
        INSERT INTO academic_years (id, tenant_id, name, start_date, end_date, is_current)
        VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc084', $1, '2026-2027', '2026-06-01', '2027-05-31', true)
        ON CONFLICT (id) DO NOTHING
    `, [TENANT_ID]);

    // 2. Grade
    await runQuery(`
        INSERT INTO grades (id, tenant_id, name, display_order)
        VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc085', $1, 'Grade 1', 1)
        ON CONFLICT (id) DO NOTHING
    `, [TENANT_ID]);

    // 3. Sections
    await runQuery(`
        INSERT INTO sections (id, tenant_id, grade_id, academic_year_id, name, capacity)
        VALUES 
        ('d5b5c928-867c-473d-88f5-1bdf3a4bc086', $1, 'd5b5c928-867c-473d-88f5-1bdf3a4bc085', 'd5b5c928-867c-473d-88f5-1bdf3a4bc084', 'A', 30),
        ('d5b5c928-867c-473d-88f5-1bdf3a4bc087', $1, 'd5b5c928-867c-473d-88f5-1bdf3a4bc085', 'd5b5c928-867c-473d-88f5-1bdf3a4bc084', 'B', 30)
        ON CONFLICT (id) DO NOTHING
    `, [TENANT_ID]);

    // 4. Subject
    await runQuery(`
        INSERT INTO subjects (id, tenant_id, name, code)
        VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc083', $1, 'Mathematics', 'MATH101')
        ON CONFLICT (id) DO NOTHING
    `, [TENANT_ID]);

    // 5. Periods
    await runQuery(`
        INSERT INTO periods (id, tenant_id, name, start_time, end_time, display_order, is_break)
        VALUES 
        ('d5b5c928-867c-473d-88f5-1bdf3a4bc088', $1, 'Period 1', '08:30', '09:15', 1, 0),
        ('d5b5c928-867c-473d-88f5-1bdf3a4bc089', $1, 'Period 2', '09:15', '10:00', 2, 0)
        ON CONFLICT (id) DO NOTHING
    `, [TENANT_ID]);

    // 6. Second Teacher User
    await runQuery(`
        INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, is_active)
        VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc082', $1, 'teacher2@schoolsis.com', '$2a$12$uDesYHq8O3X4ys6T0e5zDexPYGF4gppPgX.yZDyffG3Fv2HjYa6BS', 'Substitute', 'Teacher', 'TEACHER', true)
        ON CONFLICT (id) DO NOTHING
    `, [TENANT_ID]);
}

async function cleanDatabase() {
    await runQuery("DELETE FROM substitutions WHERE tenant_id = $1", [TENANT_ID]);
    await runQuery("DELETE FROM substitution_requests WHERE tenant_id = $1", [TENANT_ID]);
    await runQuery("DELETE FROM timetable_entries WHERE tenant_id = $1", [TENANT_ID]);
}

test.describe('Timetable Module Core E2E Tests', () => {

    test.beforeAll(async () => {
        await setupDatabase();
    });

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
        await cleanDatabase();
        // Keep standard teacher active by default
        await runQuery("UPDATE users SET is_active = true WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc032'");
    });

    test.afterAll(async () => {
        await cleanDatabase();
    });

    // ─── TIER 1 tests ───────────────────────────────────────────

    test('E2E-TT-101: View Timetable Section Dashboard', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable');
        
        await expect(page.locator('h1').filter({ hasText: 'Timetable' })).toBeVisible();
        // Locate section link
        const sectionLink = page.locator('a[href="/timetable/d5b5c928-867c-473d-88f5-1bdf3a4bc086"]');
        await expect(sectionLink).toBeVisible();
        
        // Navigate directly to avoid client-side routing hydration race conditions
        await page.goto('/timetable/d5b5c928-867c-473d-88f5-1bdf3a4bc086');
        await expect(page.locator('[data-testid="section-title"]')).toContainText('Timetable for Grade 1 - A');
    });

    test('E2E-TT-102: Load Substitution Dashboard Statistics', async ({ page }) => {
        // Insert a dummy request so statistics have counts
        const todayDate = new Date().toISOString().split('T')[0];
        await runQuery(`
            INSERT INTO substitution_requests (tenant_id, teacher_id, substitute_id, section_id, period, date, reason, status)
            VALUES ($1, 'd5b5c928-867c-473d-88f5-1bdf3a4bc032', 'd5b5c928-867c-473d-88f5-1bdf3a4bc082', 'd5b5c928-867c-473d-88f5-1bdf3a4bc086', 1, $2, 'Math Class', 'pending')
        `, [TENANT_ID, todayDate]);

        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');

        await expect(page.locator('[data-testid="kpi-today"]')).toContainText('1');
        await expect(page.locator('[data-testid="kpi-pending"]')).toContainText('1');
    });

    test('E2E-TT-103: Open Create Substitution Dialog', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        
        const btn = page.locator('[data-testid="new-substitution-btn"]');
        await expect(btn).toBeVisible();
        await btn.click();

        await expect(page.locator('text=Create Substitution Request')).toBeVisible();
    });

    test('E2E-TT-104: View Absent Teachers list', async ({ page }) => {
        // Mark teacher 1 as absent (inactive)
        await runQuery("UPDATE users SET is_active = false WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc032'");

        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');

        const card = page.locator('[data-testid="absent-teachers-card-title"]');
        await expect(card).toBeVisible();

        const list = page.locator('[data-testid="absent-teachers-list"]');
        await expect(list.locator('[data-testid="absent-teacher-item"]')).toContainText('Teacher User');
    });

    test('E2E-TT-105: Timetable Grid Placeholder Check', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/grid');

        // Check headers
        await expect(page.locator('table th:has-text("Monday")')).toBeVisible();
        await expect(page.locator('table th:has-text("Saturday")')).toBeVisible();

        // Check "Click to assign" and disclaimer
        await expect(page.locator('text=Click to assign').first()).toBeVisible();
        await expect(page.locator('text=This grid view is a placeholder. Timetable data will be fetched from the Java API when available.')).toBeVisible();
    });

    // ─── TIER 2 tests ───────────────────────────────────────────

    test('E2E-TT-201: Substitution Form validation error on empty submit', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');

        await page.click('[data-testid="new-substitution-btn"]');
        await page.click('[data-testid="submit-request-btn"]');

        await expect(page.locator('[data-testid="validation-error"]')).toContainText('Absent teacher and Subject are required');
    });

    test('E2E-TT-202: Dialog missing subject validation', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');

        await page.click('[data-testid="new-substitution-btn"]');
        
        // Select absent teacher
        await page.selectOption('[data-testid="absent-teacher-select"]', { label: 'Teacher User' });
        // Leave subject empty
        await page.fill('[data-testid="subject-input"]', '');
        
        await page.click('[data-testid="submit-request-btn"]');

        // Verify error warning is visible and dialog is still open
        await expect(page.locator('[data-testid="validation-error"]')).toContainText('Subject is required');
        await expect(page.locator('text=Create Substitution Request')).toBeVisible();
    });

    test('E2E-TT-203: Timetable Entry Teacher Double-Booking Check', async ({ page }) => {
        // Create an entry first
        await runQuery(`
            INSERT INTO timetable_entries (id, tenant_id, section_id, period_id, subject_id, teacher_id, day_of_week, room_number)
            VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc091', $1, 'd5b5c928-867c-473d-88f5-1bdf3a4bc086', 'd5b5c928-867c-473d-88f5-1bdf3a4bc088', 'd5b5c928-867c-473d-88f5-1bdf3a4bc083', 'd5b5c928-867c-473d-88f5-1bdf3a4bc032', 'MONDAY', '101')
        `, [TENANT_ID]);

        await loginAsAdmin(page);
        await page.goto('/timetable/new');

        // Select different class but same day, period, teacher
        await page.selectOption('[data-testid="class-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc087' }); // Section B
        await page.selectOption('[data-testid="subject-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc083' }); // Mathematics
        await page.selectOption('[data-testid="day-select"]', { value: 'MONDAY' });
        await page.selectOption('[data-testid="period-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc088' }); // Period 1
        await page.selectOption('[data-testid="teacher-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc032' }); // Teacher User
        await page.fill('[data-testid="room-input"]', '102');

        await page.click('[data-testid="submit-btn"]');

        await expect(page.locator('[data-testid="error-message"]')).toContainText('Teacher is already assigned to');
    });

    test('E2E-TT-204: Timetable Entry Room Double-Booking Check', async ({ page }) => {
        // Create an entry first
        await runQuery(`
            INSERT INTO timetable_entries (id, tenant_id, section_id, period_id, subject_id, teacher_id, day_of_week, room_number)
            VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc091', $1, 'd5b5c928-867c-473d-88f5-1bdf3a4bc086', 'd5b5c928-867c-473d-88f5-1bdf3a4bc088', 'd5b5c928-867c-473d-88f5-1bdf3a4bc083', 'd5b5c928-867c-473d-88f5-1bdf3a4bc032', 'MONDAY', '101')
        `, [TENANT_ID]);

        await loginAsAdmin(page);
        await page.goto('/timetable/new');

        // Select different class and different teacher, but same day, period, room
        await page.selectOption('[data-testid="class-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc087' }); // Section B
        await page.selectOption('[data-testid="subject-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc083' }); // Mathematics
        await page.selectOption('[data-testid="day-select"]', { value: 'MONDAY' });
        await page.selectOption('[data-testid="period-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc088' }); // Period 1
        await page.selectOption('[data-testid="teacher-select"]', { value: 'd5b5c928-867c-473d-88f5-1bdf3a4bc082' }); // Substitute Teacher (different)
        await page.fill('[data-testid="room-input"]', '101'); // same room

        await page.click('[data-testid="submit-btn"]');

        await expect(page.locator('[data-testid="error-message"]')).toContainText('is already assigned to');
    });

    test('E2E-TT-205: Substitution details invalid id routing', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution/detail/invalid-uuid');

        const errorContainer = page.locator('[data-testid="error-container"]');
        await expect(errorContainer).toBeVisible();
        await expect(errorContainer).toContainText('Invalid ID Format');
    });

    // ─── TIER 3 & TIER 4 tests ──────────────────────────────────

    test('E2E-COM-303: Timetable Substitution Request approval updates teacher schedule', async ({ page }) => {
        const todayDate = new Date().toISOString().split('T')[0];
        
        // Insert a pending request for teacher 2 (Substitute Teacher) to cover Teacher User (teacher 1)
        const subReqId = 'd5b5c928-867c-473d-88f5-1bdf3a4bc095';
        await runQuery(`
            INSERT INTO substitution_requests (id, tenant_id, teacher_id, substitute_id, section_id, period, date, reason, status)
            VALUES ($1, $2, 'd5b5c928-867c-473d-88f5-1bdf3a4bc032', 'd5b5c928-867c-473d-88f5-1bdf3a4bc082', 'd5b5c928-867c-473d-88f5-1bdf3a4bc086', 1, $3, 'Substitution Math Class', 'pending')
        `, [subReqId, TENANT_ID, todayDate]);

        // Login as admin and approve it
        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');
        
        const approveBtn = page.locator(`[data-testid="approve-btn-${subReqId}"]`);
        await expect(approveBtn).toBeVisible();
        await approveBtn.click();
        
        // Verify approved badge displays
        await expect(page.locator(`[data-testid="substitution-row-${subReqId}"]`)).toContainText('Approved');

        // Logout
        await page.click('text=Logout'); // wait, let's just clear cookies and go to login
        await page.context().clearCookies();

        // Login as substitute teacher (Teacher 2)
        await loginAsTeacher2(page);
        await page.goto('/teacher/schedule');

        // Verify period 1 has the substitution badge and details
        const period1Schedule = page.locator('[data-testid="schedule-period-1"]');
        await expect(period1Schedule).toBeVisible();
        await expect(period1Schedule.locator('[data-testid="substitution-badge"]')).toContainText('Substitution');
        await expect(period1Schedule).toContainText('Substitution Math Class');
    });

    test('E2E-WRK-403: Start-of-Day Absenteeism Substitution routing', async ({ page }) => {
        // Mark teacher 1 as absent
        await runQuery("UPDATE users SET is_active = false WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc032'");

        await loginAsAdmin(page);
        await page.goto('/timetable/substitution');

        // Verify teacher 1 shows up as absent today
        await expect(page.locator('[data-testid="absent-teachers-list"]')).toContainText('Teacher User');

        // Open Dialog
        await page.click('[data-testid="new-substitution-btn"]');

        // Select Absent Teacher, enter details, select available substitute
        await page.selectOption('[data-testid="absent-teacher-select"]', { label: 'Teacher User' });
        await page.fill('[data-testid="subject-input"]', 'Advanced Math');
        await page.selectOption('[data-testid="substitute-teacher-select"]', { label: 'Substitute Teacher' });

        // Submit
        await page.click('[data-testid="submit-request-btn"]');

        // Verify request is added to table with pending state and substitute name
        await expect(page.locator('[data-testid="substitutions-table"]')).toContainText('Teacher User');
        await expect(page.locator('[data-testid="substitutions-table"]')).toContainText('Substitute Teacher');
        await expect(page.locator('[data-testid="substitutions-table"]')).toContainText('Pending');
    });

    test('E2E-WRK-405: New Term Class Period Schedule Bulk Uploading', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/timetable/bulk');

        // 1. Try to upload with conflict
        // Create an entry first that will cause conflict
        await runQuery(`
            INSERT INTO timetable_entries (id, tenant_id, section_id, period_id, subject_id, teacher_id, day_of_week, room_number)
            VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc099', $1, 'd5b5c928-867c-473d-88f5-1bdf3a4bc086', 'd5b5c928-867c-473d-88f5-1bdf3a4bc088', 'd5b5c928-867c-473d-88f5-1bdf3a4bc083', 'd5b5c928-867c-473d-88f5-1bdf3a4bc032', 'MONDAY', '101')
        `, [TENANT_ID]);

        // Uploading entry that double books Teacher User on MONDAY Period 1 for Section B
        const conflictedJSON = JSON.stringify([
            {
                sectionId: 'd5b5c928-867c-473d-88f5-1bdf3a4bc087', // Section B
                periodId: 'd5b5c928-867c-473d-88f5-1bdf3a4bc088', // Period 1
                dayOfWeek: 'MONDAY',
                subjectId: 'd5b5c928-867c-473d-88f5-1bdf3a4bc083',
                teacherId: 'd5b5c928-867c-473d-88f5-1bdf3a4bc032', // same teacher
                roomNumber: '102'
            }
        ], null, 2);

        await page.fill('[data-testid="bulk-json-input"]', conflictedJSON);
        await page.click('[data-testid="bulk-upload-btn"]');

        // Verify conflict warning list is displayed
        await expect(page.locator('[data-testid="conflict-warning-list"]')).toBeVisible();
        await expect(page.locator('[data-testid="bulk-error-message"]')).toContainText('Found 1 conflicts');

        // 2. Resolve conflict by using Checkbox to skip conflicts and finalize
        await page.check('[data-testid="skip-conflicts-checkbox"]');
        await page.click('[data-testid="bulk-upload-btn"]');

        // Verify success message
        await expect(page.locator('[data-testid="bulk-success-message"]')).toContainText('Bulk upload completed with some conflicts skipped');
    });

});
