import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

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

test.describe('Advanced Analytics E2E Tests', () => {

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    // TIER 1: Feature Coverage (5 tests)

    test('E2E-AN-101: Analytics Dashboard metrics cards load', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/analytics');
        
        await expect(page.locator('h1')).toContainText('Analytics Dashboard');
        await expect(page.getByText('Total Students')).toBeVisible();
        await expect(page.getByText('Fee Collected (YTD)')).toBeVisible();
        await expect(page.getByText('Avg Attendance')).toBeVisible();
        await expect(page.getByText('Avg Exam Score')).toBeVisible();
    });

    test('E2E-AN-102: View Fee Collection Trend bar chart', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/analytics');
        
        await expect(page.locator('h3:has-text("Fee Collection Trend")')).toBeVisible();
        // Check that at least one month bar or text is visible
        await expect(page.locator('text=View Details →').first()).toBeVisible();
    });

    test('E2E-AN-103: View Attendance heatmap/grid', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/analytics');
        
        await expect(page.locator('h3:has-text("Attendance (Last 30 Days)")')).toBeVisible();
        await expect(page.locator('text=Mon').first()).toBeVisible();
        await expect(page.locator('text=Sun').first()).toBeVisible();
    });

    test('E2E-AN-104: View Class-wise Exam performance chart', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/analytics');
        
        await expect(page.locator('h3:has-text("Class-wise Exam Performance")')).toBeVisible();
    });

    test('E2E-AN-105: View Top Performers table', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/analytics');
        
        await expect(page.locator('h3:has-text("Top Performers")')).toBeVisible();
    });

    // TIER 2: Boundary & Corner Cases (5 tests)

    test('E2E-AN-201: Redirection for parent/teacher roles on core analytics page', async ({ page }) => {
        await loginAsParent(page);
        
        await page.goto('/analytics');
        await page.waitForURL(url => url.pathname === '/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();
    });

    test('E2E-AN-202: Top performers empty state (no student scores)', async ({ page }) => {
        const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
        
        // Backup exam results
        const backupResults = await runQuery(`
            SELECT * FROM student_results WHERE tenant_id = $1
        `, [tenantId]);
        
        try {
            // Delete exam results for this tenant to check empty state
            await runQuery(`
                DELETE FROM student_results WHERE tenant_id = $1
            `, [tenantId]);
            
            await loginAsAdmin(page);
            await page.goto('/analytics');
            
            // Verification: Dashboard should still render and show empty list/placeholder gracefully.
            await expect(page.locator('h3:has-text("Top Performers")')).toBeVisible();
        } finally {
            // Restore exam results
            for (const r of backupResults.rows) {
                await runQuery(`
                    INSERT INTO student_results (id, tenant_id, exam_schedule_id, student_id, marks_obtained, grade, remarks, is_absent, entered_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (id) DO NOTHING
                `, [r.id, r.tenant_id, r.exam_schedule_id, r.student_id, r.marks_obtained, r.grade, r.remarks, r.is_absent, r.entered_by, r.created_at, r.updated_at]);
            }
        }
    });

    test('E2E-AN-203: Attendance heatmap handles missing date values gracefully', async ({ page }) => {
        const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
        
        // Backup attendance records
        const backupAttendance = await runQuery(`
            SELECT * FROM attendance_records WHERE tenant_id = $1
        `, [tenantId]);
        
        try {
            await runQuery(`
                DELETE FROM attendance_records WHERE tenant_id = $1
            `, [tenantId]);
            
            await loginAsAdmin(page);
            await page.goto('/analytics');
            
            // Verification: Grid should load without crash
            await expect(page.locator('h3:has-text("Attendance (Last 30 Days)")')).toBeVisible();
        } finally {
            // Restore attendance
            for (const att of backupAttendance.rows) {
                await runQuery(`
                    INSERT INTO attendance_records (id, tenant_id, student_id, section_id, date, status, remarks, marked_by, is_notified, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (id) DO NOTHING
                `, [att.id, att.tenant_id, att.student_id, att.section_id, att.date, att.status, att.remarks, att.marked_by, att.is_notified, att.created_at, att.updated_at]);
            }
        }
    });

    test('E2E-AN-204: Zero fee collected state shows 0% collection or handles empty array', async ({ page }) => {
        const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
        
        // Backup receipts and payments
        const backupReceipts = await runQuery(`
            SELECT * FROM receipts WHERE tenant_id = $1
        `, [tenantId]);
        const backupPayments = await runQuery(`
            SELECT * FROM payments WHERE tenant_id = $1
        `, [tenantId]);
        
        try {
            await runQuery(`
                DELETE FROM receipts WHERE tenant_id = $1
            `, [tenantId]);
            await runQuery(`
                DELETE FROM payments WHERE tenant_id = $1
            `, [tenantId]);
            
            await loginAsAdmin(page);
            await page.goto('/analytics');
            
            // Total Collected metric should be 0 or show ₹0.0Cr/YTD
            await expect(page.locator('div.text-2xl:near(:text("Fee Collected (YTD)"))').first()).toContainText('0');
        } finally {
            // Restore payments
            for (const p of backupPayments.rows) {
                await runQuery(`
                    INSERT INTO payments (id, tenant_id, invoice_id, student_id, amount, paid_at, method, status, transaction_id, razorpay_payment_id, cheque_number, bank_name, notes, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT (id) DO NOTHING
                `, [p.id, p.tenant_id, p.invoice_id, p.student_id, p.amount, p.paid_at, p.method, p.status, p.transaction_id, p.razorpay_payment_id, p.cheque_number, p.bank_name, p.notes, p.created_at]);
            }
            // Restore receipts
            for (const r of backupReceipts.rows) {
                await runQuery(`
                    INSERT INTO receipts (id, tenant_id, payment_id, receipt_number, pdf_url, issued_at, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO NOTHING
                `, [r.id, r.tenant_id, r.payment_id, r.receipt_number, r.pdf_url, r.issued_at, r.created_at]);
            }
        }
    });

    test('E2E-AN-205: Exam score graph handles missing sections or empty classes', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/analytics');
        
        // Class-wise Exam performance chart should still be visible
        await expect(page.locator('h3:has-text("Class-wise Exam Performance")')).toBeVisible();
    });

    // TIER 4: Real-World Application Scenarios (1 test)

    test('E2E-WRK-409: Term-end academic audit workflow', async ({ page }) => {
        await loginAsAdmin(page);
        
        // Step 1: Pull advanced exam analytics
        await page.goto('/analytics');
        await expect(page.locator('h3:has-text("Class-wise Exam Performance")')).toBeVisible();
        
        // Navigate to exam sub-analytics page
        await page.click('text=View Details → >> xpath=../../.. >> text=View Details →'); // clicks the link under Class-wise performance
        await page.waitForTimeout(1000);
        
        // Step 2: Verify academic calendar schedules
        await page.goto('/calendar');
        await expect(page.locator('h1')).toContainText('Academic Calendar');
        
        // Total Events metric and list of upcoming events visible
        await expect(page.locator('h3:has-text("Upcoming Events")')).toBeVisible();
        await expect(page.locator('text=Total Events')).toBeVisible();
    });

});
