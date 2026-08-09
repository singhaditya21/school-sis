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

test.describe('Financial & Treasury E2E Tests', () => {

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    // TIER 1: Feature Coverage (5 tests)

    test('E2E-TR-101: Treasury Dashboard loads with summary metrics', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/treasury');
        
        await expect(page.locator('h1')).toContainText('Payment Orchestration');
        await expect(page.getByText('Recorded Payment Amount')).toBeVisible();
        await expect(page.getByText('Outstanding Receivables')).toBeVisible();
        await expect(page.getByText('Overdue Invoice Amount')).toBeVisible();
    });

    test('E2E-TR-102: View Reconciliation Exceptions table with transactions', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/treasury');
        
        await expect(page.locator('h3:has-text("Reconciliation Exceptions")')).toBeVisible();
        await expect(page.locator('table th:has-text("Transaction ID")').first()).toBeVisible();
        await expect(page.locator('table th:has-text("Payment Method")')).toBeVisible();
        await expect(page.locator('table th:has-text("Amount")').first()).toBeVisible();

        // Fabricated gateway exceptions must never be merged into database results.
        await expect(page.getByText('txn_74h284jf')).toHaveCount(0);
        await expect(page.getByText('txn_p398d2jk')).toHaveCount(0);
    });

    test('E2E-TR-103: Sync Vouchers form default dates populated', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');
        
        const fromDateInput = page.locator('#fromDate');
        const toDateInput = page.locator('#toDate');
        
        await expect(fromDateInput).toBeVisible();
        await expect(toDateInput).toBeVisible();
        
        // Default value should be populated as ISO date YYYY-MM-DD
        const fromVal = await fromDateInput.inputValue();
        const toVal = await toDateInput.inputValue();
        
        expect(fromVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(toVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('E2E-TR-104: Ledger mapping config mappings list', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');
        
        await expect(page.locator('h3:has-text("Built-in export mapping")')).toBeVisible();
        await expect(page.getByText('ScholarMind System Method')).toBeVisible();
        await expect(page.getByText('Tally Target Ledger Name')).toBeVisible();
        
        // Verify key mapped methods
        await expect(page.getByText('CASH', { exact: true })).toBeVisible();
        await expect(page.getByText('HDFC Bank', { exact: true })).toBeVisible();
        await expect(page.getByText('UPI Collections', { exact: true })).toBeVisible();
    });

    test('E2E-TR-105: Unimplemented exception actions are not exposed', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/treasury');

        await expect(page.getByRole('button', { name: /challenge/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0);
    });

    // TIER 2: Boundary & Corner Cases (5 tests)

    test('E2E-TR-201: Access restricted for unauthorized parent role', async ({ page }) => {
        await loginAsParent(page);
        
        // Parent accessing /treasury should be redirected
        await page.goto('/treasury');
        await page.waitForURL(url => url.pathname === '/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();
        
        // Parent accessing /integrations/tally should be redirected
        await page.goto('/integrations/tally');
        await page.waitForURL(url => url.pathname === '/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();
    });

    test('E2E-TR-202: Tally export date validator blocks empty submission', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');
        
        const fromDateInput = page.locator('#fromDate');
        await fromDateInput.fill('');
        
        // Click download tally XML button
        const submitBtn = page.locator('button:has-text("Download Tally XML")');
        await submitBtn.click();
        
        // The input has the required attribute, verify validity state
        const isRequired = await fromDateInput.evaluate((el: HTMLInputElement) => el.required);
        expect(isRequired).toBe(true);
    });

    test('E2E-TR-203: Handle negative/zero or empty receivables/overdue database state', async ({ page }) => {
        const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
        
        // Backup outstanding/overdue invoice statuses
        const originalInvoices = await runQuery(`
            SELECT id, status FROM invoices WHERE tenant_id = $1
        `, [tenantId]);
        
        try {
            // Set all invoices to PAID so outstanding/overdue becomes 0
            await runQuery(`
                UPDATE invoices SET status = 'PAID' WHERE tenant_id = $1
            `, [tenantId]);
            
            await loginAsAdmin(page);
            await page.goto('/treasury');
            
            // Check that persisted outstanding and overdue totals resolve to zero.
            await expect(page.getByText('Outstanding Receivables').locator('..').locator('.text-4xl')).toContainText('0.00');
            await expect(page.getByText('Overdue Invoice Amount').locator('..').locator('.text-4xl')).toContainText('0.00');
        } finally {
            // Restore database invoices
            for (const inv of originalInvoices.rows) {
                await runQuery(`
                    UPDATE invoices SET status = $1 WHERE id = $2
                `, [inv.status, inv.id]);
            }
        }
    });

    test('E2E-TR-204: Tally export with invalid date range validation handling', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');
        
        // Set fromDate > toDate
        await page.fill('#fromDate', '2026-06-30');
        await page.fill('#toDate', '2026-06-01');
        
        await page.click('button:has-text("Download Tally XML")');
        await expect(page.getByText('From date must be on or before the to date.')).toBeVisible();
    });

    test('E2E-TR-205: View mappings configuration empty state or backup mappings', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');
        
        // Verify backup mappings or warning message is visible
        await expect(page.locator('text=Ensure the Tally Ledger names match exactly')).toBeVisible();
    });

    // TIER 3: Cross-Feature Combinations (1 test)

    test('E2E-COM-310: Tally export does not fabricate download history', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');

        await expect(page.getByText(/Export history is not yet stored/)).toBeVisible();
        await expect(page.getByText("Yesterday's Collections")).toHaveCount(0);
        await expect(page.getByText('24 Vouchers')).toHaveCount(0);
    });

    // TIER 4: Real-World Application Scenarios (1 test)

    test('E2E-WRK-406: Mid-term financial sync workflow', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/treasury');
        
        // Admin reviews persisted payment and exception data without synthetic rows.
        await expect(page.locator('h3:has-text("Reconciliation Exceptions")')).toBeVisible();
        await expect(page.getByText('txn_74h284jf')).toHaveCount(0);
        
        // Navigate to Tally Integration to export vouchers
        await page.goto('/integrations/tally');
        await expect(page.locator('#fromDate')).toBeVisible();
        await expect(page.locator('#toDate')).toBeVisible();
        
        // Export updated vouchers
        await page.fill('#fromDate', '2026-06-01');
        await page.fill('#toDate', '2026-06-29');
        
        // Submitting download triggers request to API which handles generation
        // (Just click the button to verify the frontend submission runs)
        await page.click('button:has-text("Download Tally XML")');
    });

});
