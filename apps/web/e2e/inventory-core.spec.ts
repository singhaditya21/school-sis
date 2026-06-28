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

// Helper function for admin login
async function loginAsAdmin(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

// Helper function for parent login
async function loginAsParent(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'parent@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'parent123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/overview');
}

// Valid deterministic UUIDs for test isolation
const TEST_ASSET_ID_1 = '9d91adf6-a010-414b-bfb6-b09e010414b1';
const TEST_ASSET_ID_2 = '9d91adf6-a010-414b-bfb6-b09e010414b2';
const TEST_ASSET_ID_3 = '9d91adf6-a010-414b-bfb6-b09e010414b3';

const TEST_CONSUMABLE_ID_1 = '9d91adf6-a010-414b-bfb6-b09e010414c1';
const TEST_CONSUMABLE_ID_2 = '9d91adf6-a010-414b-bfb6-b09e010414c2';
const TEST_CONSUMABLE_ID_3 = '9d91adf6-a010-414b-bfb6-b09e010414c3';

const TEST_ALERT_ID_1 = '9d91adf6-a010-414b-bfb6-b09e010414d1';
const TEST_ALERT_ID_2 = '9d91adf6-a010-414b-bfb6-b09e010414d2';
const TEST_ALERT_ID_3 = '9d91adf6-a010-414b-bfb6-b09e010414d3';

test.describe('Inventory Module Core E2E Tests', () => {
    let tenantId: string;

    test.beforeAll(async () => {
        // Resolve tenantId
        const tenantRes = await runQuery("SELECT tenant_id FROM users WHERE email = 'admin@schoolsis.com' LIMIT 1");
        tenantId = tenantRes.rows[0].tenant_id;

        // Check if 'UNKNOWN' value is present in asset_condition enum type.
        const checkEnum = await runQuery(`
            SELECT exists (
                SELECT 1 FROM pg_type t 
                JOIN pg_enum e ON t.oid = e.enumtypid 
                WHERE t.typname = 'asset_condition' AND e.enumlabel = 'UNKNOWN'
            ) as exists
        `);
        if (!checkEnum.rows[0].exists) {
            await runQuery("ALTER TYPE asset_condition ADD VALUE 'UNKNOWN'");
        }
    });

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();

        // Clean up test records
        await runQuery("DELETE FROM stock_alerts WHERE item_id IN ($1, $2, $3, $4, $5, $6)", [
            TEST_ASSET_ID_1, TEST_ASSET_ID_2, TEST_ASSET_ID_3,
            TEST_CONSUMABLE_ID_1, TEST_CONSUMABLE_ID_2, TEST_CONSUMABLE_ID_3
        ]);
        await runQuery("DELETE FROM assets WHERE id IN ($1, $2, $3)", [
            TEST_ASSET_ID_1, TEST_ASSET_ID_2, TEST_ASSET_ID_3
        ]);
        await runQuery("DELETE FROM consumables WHERE id IN ($1, $2, $3)", [
            TEST_CONSUMABLE_ID_1, TEST_CONSUMABLE_ID_2, TEST_CONSUMABLE_ID_3
        ]);
    });

    test.afterAll(async () => {
        // Final cleanup
        await runQuery("DELETE FROM stock_alerts WHERE item_id IN ($1, $2, $3, $4, $5, $6)", [
            TEST_ASSET_ID_1, TEST_ASSET_ID_2, TEST_ASSET_ID_3,
            TEST_CONSUMABLE_ID_1, TEST_CONSUMABLE_ID_2, TEST_CONSUMABLE_ID_3
        ]);
        await runQuery("DELETE FROM assets WHERE id IN ($1, $2, $3)", [
            TEST_ASSET_ID_1, TEST_ASSET_ID_2, TEST_ASSET_ID_3
        ]);
        await runQuery("DELETE FROM consumables WHERE id IN ($1, $2, $3)", [
            TEST_CONSUMABLE_ID_1, TEST_CONSUMABLE_ID_2, TEST_CONSUMABLE_ID_3
        ]);
    });

    test('E2E-IN-101: View Assets Log', async ({ page }) => {
        await runQuery(`
            INSERT INTO assets (id, tenant_id, name, category, serial_number, purchase_date, purchase_price, location, condition)
            VALUES ($1, $2, 'E2E Office Chair', 'FURNITURE', 'SN-CHAIR-101', '2026-01-01', 5000.00, 'Admin Room 101', 'EXCELLENT')
        `, [TEST_ASSET_ID_1, tenantId]);

        await loginAsAdmin(page);
        await page.goto('/inventory');

        await expect(page.locator(`[data-testid="asset-name-${TEST_ASSET_ID_1}"]`)).toContainText('E2E Office Chair');
        await expect(page.locator(`[data-testid="asset-serial-${TEST_ASSET_ID_1}"]`)).toContainText('SN-CHAIR-101');
        await expect(page.locator(`[data-testid="asset-category-${TEST_ASSET_ID_1}"]`)).toContainText('FURNITURE');
        await expect(page.locator(`[data-testid="asset-location-${TEST_ASSET_ID_1}"]`)).toContainText('Admin Room 101');
        await expect(page.locator(`[data-testid="asset-condition-${TEST_ASSET_ID_1}"]`)).toContainText('EXCELLENT');
        await expect(page.locator(`[data-testid="asset-price-${TEST_ASSET_ID_1}"]`)).toContainText('₹5,000');
    });

    test('E2E-IN-102: View Consumables Log', async ({ page }) => {
        await runQuery(`
            INSERT INTO consumables (id, tenant_id, name, category, unit, current_stock, minimum_stock, reorder_level, unit_price, supplier)
            VALUES ($1, $2, 'E2E A4 Paper', 'STATIONERY', 'reams', 120, 20, 30, 250.00, 'Super Paper Ltd')
        `, [TEST_CONSUMABLE_ID_1, tenantId]);

        await loginAsAdmin(page);
        await page.goto('/inventory');

        await expect(page.locator(`[data-testid="consumable-name-${TEST_CONSUMABLE_ID_1}"]`)).toContainText('E2E A4 Paper');
        await expect(page.locator(`[data-testid="consumable-category-${TEST_CONSUMABLE_ID_1}"]`)).toContainText('STATIONERY');
        await expect(page.locator(`[data-testid="consumable-stock-${TEST_CONSUMABLE_ID_1}"]`)).toContainText('120 reams');
        await expect(page.locator(`[data-testid="consumable-min-${TEST_CONSUMABLE_ID_1}"]`)).toContainText('20');
        await expect(page.locator(`[data-testid="consumable-supplier-${TEST_CONSUMABLE_ID_1}"]`)).toContainText('Super Paper Ltd');
    });

    test('E2E-IN-103: View Inventory Alert Dashboard', async ({ page }) => {
        // Fetch current active alerts counts in DB for baseline
        const initialCountRes = await runQuery(`
            SELECT 
                COUNT(*) filter (where severity = 'CRITICAL') as critical,
                COUNT(*) filter (where severity = 'WARNING') as warning,
                COUNT(*) filter (where severity = 'INFO') as info,
                COUNT(*) as total
            FROM stock_alerts
            WHERE tenant_id = $1 AND is_resolved = false
        `, [tenantId]);
        
        const initCritical = Number(initialCountRes.rows[0].critical || 0);
        const initWarning = Number(initialCountRes.rows[0].warning || 0);
        const initInfo = Number(initialCountRes.rows[0].info || 0);
        const initTotal = Number(initialCountRes.rows[0].total || 0);

        // Seed items and alerts
        await runQuery(`
            INSERT INTO consumables (id, tenant_id, name, category, unit, current_stock, minimum_stock, reorder_level)
            VALUES ($1, $2, 'Alert Item 1', 'STATIONERY', 'packs', 0, 10, 20)
        `, [TEST_CONSUMABLE_ID_1, tenantId]);

        await runQuery(`
            INSERT INTO stock_alerts (id, tenant_id, item_id, item_type, alert_type, severity, message, is_resolved)
            VALUES 
                ($1, $2, $3, 'CONSUMABLE', 'OUT_OF_STOCK', 'CRITICAL', 'Alert Item 1 is empty!', false),
                ($4, $2, $3, 'CONSUMABLE', 'LOW_STOCK', 'WARNING', 'Alert Item 1 is low!', false)
        `, [TEST_ALERT_ID_1, tenantId, TEST_CONSUMABLE_ID_1, TEST_ALERT_ID_2]);

        await loginAsAdmin(page);
        await page.goto('/inventory/alerts');

        await expect(page.locator('[data-testid="kpi-critical-count"]')).toContainText(String(initCritical + 1));
        await expect(page.locator('[data-testid="kpi-warning-count"]')).toContainText(String(initWarning + 1));
        await expect(page.locator('[data-testid="kpi-info-count"]')).toContainText(String(initInfo));
        await expect(page.locator('[data-testid="kpi-total-alerts"]')).toContainText(String(initTotal + 2));
    });

    test('E2E-IN-104: View Reorder Suggestions', async ({ page }) => {
        // Seed low stock item
        // Current: 5, Reorder Level: 20, Min: 10
        // Suggested quantity: max(20 * 2 - 5, 10) = 35
        await runQuery(`
            INSERT INTO consumables (id, tenant_id, name, category, unit, current_stock, minimum_stock, reorder_level)
            VALUES ($1, $2, 'E2E Sticky Notes', 'STATIONERY', 'packs', 5, 10, 20)
        `, [TEST_CONSUMABLE_ID_3, tenantId]);

        await loginAsAdmin(page);
        await page.goto('/inventory/alerts');

        await expect(page.locator(`[data-testid="reorder-row-${TEST_CONSUMABLE_ID_3}"]`)).toBeVisible();
        await expect(page.locator(`[data-testid="reorder-item-name-${TEST_CONSUMABLE_ID_3}"]`)).toContainText('E2E Sticky Notes');
        await expect(page.locator(`[data-testid="reorder-current-stock-${TEST_CONSUMABLE_ID_3}"]`)).toContainText('5 packs');
        await expect(page.locator(`[data-testid="reorder-level-${TEST_CONSUMABLE_ID_3}"]`)).toContainText('20 packs');
        await expect(page.locator(`[data-testid="reorder-suggested-qty-${TEST_CONSUMABLE_ID_3}"]`)).toContainText('35 packs');
    });

    test('E2E-IN-105: Filter Stock Alerts by Severity', async ({ page }) => {
        await runQuery(`
            INSERT INTO consumables (id, tenant_id, name, category, unit, current_stock, minimum_stock, reorder_level)
            VALUES ($1, $2, 'Filter Item', 'STATIONERY', 'units', 0, 10, 20)
        `, [TEST_CONSUMABLE_ID_1, tenantId]);

        await runQuery(`
            INSERT INTO stock_alerts (id, tenant_id, item_id, item_type, alert_type, severity, message, is_resolved)
            VALUES 
                ($1, $2, $3, 'CONSUMABLE', 'OUT_OF_STOCK', 'CRITICAL', 'Filter Item critical alert', false),
                ($4, $2, $3, 'CONSUMABLE', 'LOW_STOCK', 'WARNING', 'Filter Item warning alert', false)
        `, [TEST_ALERT_ID_1, tenantId, TEST_CONSUMABLE_ID_1, TEST_ALERT_ID_2]);

        await loginAsAdmin(page);
        await page.goto('/inventory/alerts');

        await expect(page.locator(`[data-testid="alert-message-${TEST_ALERT_ID_1}"]`)).toBeVisible();
        await expect(page.locator(`[data-testid="alert-message-${TEST_ALERT_ID_2}"]`)).toBeVisible();

        // Click "Critical" filter card
        await page.click('[data-testid="filter-critical"]');

        await expect(page.locator(`[data-testid="alert-message-${TEST_ALERT_ID_1}"]`)).toBeVisible();
        await expect(page.locator(`[data-testid="alert-message-${TEST_ALERT_ID_2}"]`)).not.toBeVisible();
    });

    test('E2E-IN-201: Consumable low-stock red background indicator', async ({ page }) => {
        await runQuery(`
            INSERT INTO consumables (id, tenant_id, name, category, unit, current_stock, minimum_stock, reorder_level)
            VALUES ($1, $2, 'Low Stock indicator Item', 'STATIONERY', 'packs', 2, 10, 20)
        `, [TEST_CONSUMABLE_ID_3, tenantId]);

        await loginAsAdmin(page);
        await page.goto('/inventory');

        const row = page.locator(`[data-testid="consumable-row-${TEST_CONSUMABLE_ID_3}"]`);
        await expect(row).toBeVisible();
        await expect(row).toHaveClass(/bg-red-50/);
    });

    test('E2E-IN-202: Stock Alerts empty alert dashboard', async ({ page }) => {
        // Fetch and store IDs of active alerts to restore them later
        const activeAlertsRes = await runQuery(`
            SELECT id FROM stock_alerts WHERE tenant_id = $1 AND is_resolved = false
        `, [tenantId]);
        const alertIds = activeAlertsRes.rows.map(r => r.id);

        try {
            await runQuery(`
                UPDATE stock_alerts SET is_resolved = true, resolved_at = NOW() WHERE tenant_id = $1 AND is_resolved = false
            `, [tenantId]);

            await loginAsAdmin(page);
            await page.goto('/inventory/alerts');

            await expect(page.locator('[data-testid="no-alerts-placeholder"]')).toBeVisible();
            await expect(page.locator('[data-testid="no-alerts-placeholder"]')).toContainText('No alerts');
        } finally {
            if (alertIds.length > 0) {
                await runQuery(`
                    UPDATE stock_alerts SET is_resolved = false, resolved_at = NULL WHERE id = ANY($1)
                `, [alertIds]);
            }
        }
    });

    test('E2E-IN-203: Asset condition tag fallback check', async ({ page }) => {
        await runQuery(`
            INSERT INTO assets (id, tenant_id, name, category, serial_number, condition)
            VALUES ($1, $2, 'Fallback Asset', 'IT_EQUIPMENT', 'SN-FALLBACK-101', 'UNKNOWN')
        `, [TEST_ASSET_ID_2, tenantId]);

        await loginAsAdmin(page);
        await page.goto('/inventory');

        const tag = page.locator(`[data-testid="asset-condition-${TEST_ASSET_ID_2}"]`);
        await expect(tag).toBeVisible();
        await expect(tag).toContainText('UNKNOWN');
        await expect(tag).toHaveClass(/bg-gray-100/);
        await expect(tag).toHaveClass(/text-gray-700/);
    });

    test('E2E-IN-204: Unauthenticated access block on alerts route', async ({ page }) => {
        await page.goto('/inventory/alerts');
        await page.waitForURL(/\/login/);
        await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    });

    test('E2E-IN-205: Alerts access rejected for Parent role', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/inventory/alerts');
        await page.waitForURL(/\/unauthorized/);
        await expect(page.getByText(/unauthorized/i).first()).toBeVisible();
    });

    test('E2E-COM-305: Inventory Asset condition change triggers Maintenance notification', async ({ page }) => {
        await runQuery(`
            INSERT INTO assets (id, tenant_id, name, category, serial_number, condition)
            VALUES ($1, $2, 'Triggers Maintenance Asset', 'IT_EQUIPMENT', 'SN-MAINT-101', 'GOOD')
        `, [TEST_ASSET_ID_1, tenantId]);

        await loginAsAdmin(page);
        await page.goto('/inventory');

        // Select Needs Repair
        const select = page.locator(`[data-testid="asset-condition-select-${TEST_ASSET_ID_1}"]`);
        await select.selectOption('NEEDS_REPAIR');

        // Click Update
        await page.click(`[data-testid="asset-condition-submit-${TEST_ASSET_ID_1}"]`);

        // Wait for revalidation check
        await expect(page.locator(`[data-testid="asset-condition-${TEST_ASSET_ID_1}"]`)).toContainText('NEEDS_REPAIR');

        // Go to Alerts
        await page.goto('/inventory/alerts');

        const alertList = page.locator('[data-testid="active-alerts-list"]');
        await expect(alertList).toContainText('Triggers Maintenance Asset');
        await expect(alertList).toContainText('needs repair!');
    });

    test('E2E-WRK-404: End-of-Term Inventory Asset Auditing & Restock', async ({ page }) => {
        // Seed Asset + its maintenance alert
        await runQuery(`
            INSERT INTO assets (id, tenant_id, name, category, serial_number, condition)
            VALUES ($1, $2, 'Audit Asset', 'IT_EQUIPMENT', 'SN-AUDIT-101', 'NEEDS_REPAIR')
        `, [TEST_ASSET_ID_1, tenantId]);
        
        await runQuery(`
            INSERT INTO stock_alerts (id, tenant_id, item_id, item_type, alert_type, severity, message, is_resolved)
            VALUES ($1, $2, $3, 'ASSET', 'MAINTENANCE_DUE', 'WARNING', 'Asset Audit Asset needs repair!', false)
        `, [TEST_ALERT_ID_1, tenantId, TEST_ASSET_ID_1]);

        // Seed low-stock consumable + its low-stock alert
        await runQuery(`
            INSERT INTO consumables (id, tenant_id, name, category, unit, current_stock, minimum_stock, reorder_level)
            VALUES ($1, $2, 'Audit Pencil', 'STATIONERY', 'boxes', 3, 10, 20)
        `, [TEST_CONSUMABLE_ID_2, tenantId]);

        await runQuery(`
            INSERT INTO stock_alerts (id, tenant_id, item_id, item_type, alert_type, severity, message, is_resolved)
            VALUES ($1, $2, $3, 'CONSUMABLE', 'LOW_STOCK', 'WARNING', 'Audit Pencil is low stock!', false)
        `, [TEST_ALERT_ID_2, tenantId, TEST_CONSUMABLE_ID_2]);

        await loginAsAdmin(page);
        await page.goto('/inventory');

        // Update condition to DISPOSED
        const select = page.locator(`[data-testid="asset-condition-select-${TEST_ASSET_ID_1}"]`);
        await select.selectOption('DISPOSED');
        await page.click(`[data-testid="asset-condition-submit-${TEST_ASSET_ID_1}"]`);
        await expect(page.locator(`[data-testid="asset-condition-${TEST_ASSET_ID_1}"]`)).toContainText('DISPOSED');

        // Check DB to verify asset alert resolved
        const assetAlertCheck = await runQuery(`
            SELECT is_resolved FROM stock_alerts WHERE id = $1
        `, [TEST_ALERT_ID_1]);
        expect(assetAlertCheck.rows[0].is_resolved).toBe(true);

        // Restock consumable by adding 17 boxes (bringing total to 20)
        await page.fill(`[data-testid="consumable-restock-qty-${TEST_CONSUMABLE_ID_2}"]`, '17');
        await page.click(`[data-testid="consumable-restock-submit-${TEST_CONSUMABLE_ID_2}"]`);

        // Verify updated stock
        await expect(page.locator(`[data-testid="consumable-stock-${TEST_CONSUMABLE_ID_2}"]`)).toContainText('20 boxes');

        // Go to Alerts page and verify alerts are gone
        await page.goto('/inventory/alerts');
        const activeAlerts = page.locator('[data-testid="active-alerts-list"]');
        if (await activeAlerts.isVisible()) {
            await expect(activeAlerts).not.toContainText('Audit Asset');
            await expect(activeAlerts).not.toContainText('Audit Pencil');
        }
    });
});
