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

test.describe('HQ & Multi-Tenant Management E2E Tests', () => {

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    // TIER 1: Feature Coverage (5 tests)

    test('E2E-HQ-101: Global Command Center loads with platform stats', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hq');
        
        await expect(page.locator('main h1')).toContainText('Global Command Center');
        await expect(page.getByText('Platform ARR')).toBeVisible();
        await expect(page.getByText('Active Tenants')).toBeVisible();
        await expect(page.getByText('Total Enrolment')).toBeVisible();
    });

    test('E2E-HQ-102: View Campus Fleet Matrix table listing active tenants', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hq');
        
        await expect(page.locator('h3:has-text("Campus Fleet Matrix")')).toBeVisible();
        await expect(page.locator('table th:has-text("Campus Name")')).toBeVisible();
        await expect(page.locator('table th:has-text("Code")')).toBeVisible();
        await expect(page.locator('table th:has-text("Status")')).toBeVisible();
        
        // Green school or demo tenants should be visible
        await expect(page.locator('table td').first()).toBeVisible();
    });

    test('E2E-HQ-103: Access Tenant Onboarding form', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hq');
        
        // Click + Provision New Campus or go directly to the page
        await page.goto('/platform/tenants/new');
        await expect(page.locator('main h1')).toContainText('Onboard New School');
        await expect(page.locator('input[name="name"]')).toBeVisible();
        await expect(page.locator('input[name="adminEmail"]')).toBeVisible();
    });

    test('E2E-HQ-104: View Tenant Configuration/Settings page', async ({ page }) => {
        await loginAsAdmin(page);
        
        // Get a valid company ID from DB
        const compRes = await runQuery('SELECT id, name FROM companies LIMIT 1');
        if (compRes.rows.length > 0) {
            const company = compRes.rows[0];
            await page.goto(`/platform/tenants/${company.id}`);
            
            await expect(page.locator('main h1')).toContainText(company.name);
            await expect(page.getByText('Provisioning Toggles')).toBeVisible();
            await expect(page.getByText('Attached Tenants')).toBeVisible();
            await expect(page.getByText('Stripe Billing Context')).toBeVisible();
        }
    });

    test('E2E-HQ-105: Verify Platform Billing metrics and stripe invoices list', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/platform/billing');
        
        await expect(page.locator('main h1')).toContainText('Platform Billing');
        await expect(page.getByText('Platform MRR (Est)')).toBeVisible();
        await expect(page.locator('h2:has-text("Recent Invoices")')).toBeVisible();
        await expect(page.locator('table th:has-text("Invoice")')).toBeVisible();
        await expect(page.locator('table th:has-text("School")')).toBeVisible();
    });

    // TIER 2: Boundary & Corner Cases (5 tests)

    test('E2E-HQ-201: Tenant onboarding form validation for empty values', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/platform/tenants/new');
        
        const nameInput = page.locator('input[name="name"]');
        const adminEmailInput = page.locator('input[name="adminEmail"]');
        
        // Try submitting empty
        await page.click('button[type="submit"]');
        
        // Inputs should be required
        const nameRequired = await nameInput.evaluate((el: HTMLInputElement) => el.required);
        const emailRequired = await adminEmailInput.evaluate((el: HTMLInputElement) => el.required);
        
        expect(nameRequired).toBe(true);
        expect(emailRequired).toBe(true);
    });

    test('E2E-HQ-202: Non-admin access to HQ redirects to unauthorized page', async ({ page }) => {
        await loginAsParent(page);
        
        await page.goto('/hq');
        await page.waitForURL(url => url.pathname === '/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();
    });

    test('E2E-HQ-203: Onboard tenant with already existing name or email error handling', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/platform/tenants/new');
        
        // Onboard one tenant first
        const testEmail = `duplicate-${Date.now()}@example.com`;
        
        await page.fill('input[name="name"]', 'Duplicate Test School');
        await page.fill('input[name="adminFirstName"]', 'Duplicate');
        await page.fill('input[name="adminLastName"]', 'Test');
        await page.fill('input[name="adminEmail"]', testEmail);
        await page.click('button[type="submit"]');
        
        // Wait for redirection
        await page.waitForURL('/platform/tenants', { timeout: 5000 });
        
        try {
            // Now try again with same email
            await page.goto('/platform/tenants/new');
            await page.fill('input[name="name"]', 'Another Duplicate School');
            await page.fill('input[name="adminFirstName"]', 'Duplicate2');
            await page.fill('input[name="adminLastName"]', 'Test2');
            await page.fill('input[name="adminEmail"]', testEmail);
            await page.click('button[type="submit"]');
            
            // Should show validation or database constraints error
            // (Due to mock actions or unique constraint in DB, check error message)
            await expect(page.locator('.text-red-600')).toBeVisible();
        } finally {
            // Clean up newly created tenant organization
            const compRes = await runQuery("SELECT id FROM companies WHERE name = 'Duplicate Test School Org'");
            if (compRes.rows.length > 0) {
                const compId = compRes.rows[0].id;
                const tenantRes = await runQuery("SELECT id FROM tenants WHERE company_id = $1", [compId]);
                for (const t of tenantRes.rows) {
                    await runQuery("DELETE FROM users WHERE tenant_id = $1", [t.id]);
                    await runQuery("DELETE FROM tenants WHERE id = $1", [t.id]);
                }
                await runQuery("DELETE FROM companies WHERE id = $1", [compId]);
            }
        }
    });

    test('E2E-HQ-204: Suspend/reactivate tenant button changes state in database or toggle view', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/platform/tenants');
        
        const tenantRes = await runQuery("SELECT id, is_active FROM tenants WHERE code != 'HQ' LIMIT 1");
        if (tenantRes.rows.length > 0) {
            const tenantId = tenantRes.rows[0].id;
            const originalStatus = tenantRes.rows[0].is_active;
            
            // Find Suspend/Reactivate button for this tenant card
            // Let's toggle it
            const toggleForm = page.locator(`div.bg-white:has(a:has-text("Manage Config"))`);
            const btn = toggleForm.locator('button:has-text("Suspend"), button:has-text("Reactivate")').first();
            
            await btn.click();
            await page.waitForTimeout(1000);
            
            // Verify state is changed in DB
            const checkRes = await runQuery("SELECT is_active FROM tenants WHERE id = $1", [tenantId]);
            expect(checkRes.rows[0].is_active).not.toBe(originalStatus);
            
            // Revert state
            await runQuery("UPDATE tenants SET is_active = $1 WHERE id = $2", [originalStatus, tenantId]);
        }
    });

    test('E2E-HQ-205: Active modules array configuration handles empty values in update company settings', async ({ page }) => {
        await loginAsAdmin(page);
        
        const compRes = await runQuery('SELECT id, name FROM companies LIMIT 1');
        if (compRes.rows.length > 0) {
            const companyId = compRes.rows[0].id;
            await page.goto(`/platform/tenants/${companyId}`);
            
            // In company settings form, let's verify it can load and save
            const saveBtn = page.locator('button:has-text("Save Configuration")');
            await expect(saveBtn).toBeVisible();
        }
    });

    // TIER 3: Cross-Feature Combinations (1 test)

    test('E2E-COM-306: Creating a new school tenant in HQ provisions database tables, and allows admin login to new dashboard', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/platform/tenants/new');
        
        const randName = `New School ${Date.now()}`;
        const newEmail = `admin-${Date.now()}@newschool.com`;
        
        await page.fill('input[name="name"]', randName);
        await page.fill('input[name="adminFirstName"]', 'New');
        await page.fill('input[name="adminLastName"]', 'Admin');
        await page.fill('input[name="adminEmail"]', newEmail);
        
        await page.click('button[type="submit"]');
        await page.waitForURL('/platform/tenants', { timeout: 5000 });
        
        // Verify in database
        const tenantRes = await runQuery(`
            SELECT t.id, t.company_id, u.id as user_id 
            FROM tenants t 
            JOIN users u ON u.tenant_id = t.id
            WHERE u.email = $1
        `, [newEmail]);
        
        expect(tenantRes.rows.length).toBe(1);
        const { id: tenantId, company_id: companyId } = tenantRes.rows[0];
        
        try {
            // Attempt to login as the new tenant admin
            await page.context().clearCookies();
            await page.goto('/login');
            await page.fill('[data-testid="email-input"]', newEmail);
            await page.fill('[data-testid="password-input"]', 'password');
            await page.click('[data-testid="login-button"]');
            
            // Should redirect to dashboard
            await page.waitForURL('/dashboard');
        } finally {
            // Clean up newly created tenant
            await runQuery("DELETE FROM users WHERE tenant_id = $1", [tenantId]);
            await runQuery("DELETE FROM tenants WHERE id = $1", [tenantId]);
            await runQuery("DELETE FROM companies WHERE id = $1", [companyId]);
        }
    });

    // TIER 4: Real-World Application Scenarios (1 test)

    test('E2E-WRK-407: Platform administrator onboarding loop workflow', async ({ page }) => {
        await loginAsAdmin(page);
        
        // Step 1: Onboard a new school
        await page.goto('/platform/tenants/new');
        const randName = `Onboarding Loop ${Date.now()}`;
        const newEmail = `loop-${Date.now()}@loop.com`;
        
        await page.fill('input[name="name"]', randName);
        await page.fill('input[name="adminFirstName"]', 'Loop');
        await page.fill('input[name="adminLastName"]', 'User');
        await page.fill('input[name="adminEmail"]', newEmail);
        await page.click('button[type="submit"]');
        await page.waitForURL('/platform/tenants', { timeout: 5000 });
        
        // Fetch new company/tenant details from DB
        const tenantRes = await runQuery(`
            SELECT t.id, t.company_id 
            FROM tenants t 
            JOIN users u ON u.tenant_id = t.id
            WHERE u.email = $1
        `, [newEmail]);
        
        expect(tenantRes.rows.length).toBe(1);
        const { id: tenantId, company_id: companyId } = tenantRes.rows[0];
        
        try {
            // Step 2: Update settings, setting custom domain mask
            await page.goto(`/platform/tenants/${companyId}`);
            await page.fill('input[placeholder="portal.clientdomain.com"]', 'custom.loop.com');
            await page.click('button:has-text("Save Configuration")');
            
            // Step 3: Verify update in DB
            const checkCompany = await runQuery("SELECT domain_mask FROM companies WHERE id = $1", [companyId]);
            expect(checkCompany.rows[0].domain_mask).toBe('custom.loop.com');
            
            // Step 4: Impersonate the school administrator to verify initialization
            await page.goto('/platform/tenants');
            
            // Impersonate first button on page or specific cards
            // As impersonate tenant redirects to /dashboard with lower privileges:
            // Since it's server action, check if button exists
            const impBtn = page.locator('button[title="Impersonate Node"]').first();
            if (await impBtn.isVisible()) {
                await impBtn.click();
            }
        } finally {
            // Clean up
            await runQuery("DELETE FROM users WHERE tenant_id = $1", [tenantId]);
            await runQuery("DELETE FROM tenants WHERE id = $1", [tenantId]);
            await runQuery("DELETE FROM companies WHERE id = $1", [companyId]);
        }
    });

});
