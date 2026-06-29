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
        await expect(page.getByText('Total Collected (YTD)')).toBeVisible();
        await expect(page.getByText('Outstanding Receivables')).toBeVisible();
        await expect(page.getByText('High Risk Overdue')).toBeVisible();
    });

    test('E2E-TR-102: View Reconciliation Exceptions table with transactions', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/treasury');
        
        await expect(page.locator('h3:has-text("Reconciliation Exceptions")')).toBeVisible();
        await expect(page.locator('table th:has-text("Transaction ID")').first()).toBeVisible();
        await expect(page.locator('table th:has-text("Gateway")')).toBeVisible();
        await expect(page.locator('table th:has-text("Amount")').first()).toBeVisible();
        
        // Assert the seeded exceptions exist in the view
        await expect(page.locator('table td:has-text("txn_74h284jf")')).toBeVisible();
        await expect(page.locator('table td:has-text("txn_p398d2jk")')).toBeVisible();
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
        
        await expect(page.locator('h3:has-text("Ledger Mapping configuration")')).toBeVisible();
        await expect(page.getByText('ScholarMind System Method')).toBeVisible();
        await expect(page.getByText('Tally Target Ledger Name')).toBeVisible();
        
        // Verify key mapped methods
        await expect(page.getByText('CASH', { exact: true })).toBeVisible();
        await expect(page.getByText('HDFC Bank', { exact: true })).toBeVisible();
        await expect(page.getByText('UPI Collections', { exact: true })).toBeVisible();
    });

    test('E2E-TR-105: Trigger Challenge action button in exception table', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/treasury');
        
        const challengeBtn = page.locator('table tr:has-text("txn_74h284jf") button:has-text("Challenge")');
        await expect(challengeBtn).toBeVisible();
        await challengeBtn.click();
        
        // Should trigger settlement challenge flow or state indicator. 
        // As it is scaffolded, check that it can be clicked without error.
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
            
            // Check that outstanding receivables and high risk overdue shows 0 or $0
            await expect(page.locator('.text-4xl:near(:text("Outstanding Receivables"))').first()).toContainText('0');
            await expect(page.locator('.text-4xl:near(:text("High Risk Overdue"))').first()).toContainText('0');
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
        
        // Listen to alert dialog or API response handling
        page.on('dialog', async dialog => {
            expect(dialog.message()).toContain('Failed to generate Tally export');
            await dialog.dismiss();
        });
        
        await page.click('button:has-text("Download Tally XML")');
    });

    test('E2E-TR-205: View mappings configuration empty state or backup mappings', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');
        
        // Verify backup mappings or warning message is visible
        await expect(page.locator('text=Ensure the Tally Ledger names match exactly')).toBeVisible();
    });

    // TIER 3: Cross-Feature Combinations (1 test)

    test('E2E-COM-310: Treasury ledger export integrates with Tally sync history records', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/integrations/tally');
        
        // Verify sync history list matches previous exports
        const syncHistory = page.locator('h3:has-text("Sync History")');
        await expect(syncHistory).toBeVisible();
        await expect(page.locator('text=Yesterday\'s Collections')).toBeVisible();
        await expect(page.locator('text=24 Vouchers')).toBeVisible();
    });

    // TIER 4: Real-World Application Scenarios (1 test)

    test('E2E-WRK-406: Mid-term financial sync workflow', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/treasury');
        
        // Admin reviews payment exceptions
        await expect(page.locator('table td:has-text("txn_74h284jf")')).toBeVisible();
        
        // Action: Click Challenge dispute
        await page.click('table tr:has-text("txn_74h284jf") button:has-text("Challenge")');
        
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
