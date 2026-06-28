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

async function loginAsTeacher(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'teacher@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'teacher123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

test.describe('Transport Module Core E2E Tests', () => {

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test('E2E-TR-101: View Configured Routes List', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/transport');
        
        await expect(page.locator('main h1')).toContainText('Transport');
        
        // Verify Route 1 card displays route name, stops count, monthly fee
        const routeCard = page.locator('div.bg-white.rounded-xl.shadow-sm.border:has-text("Route 1")');
        await expect(routeCard).toBeVisible();
        await expect(routeCard.locator('h3')).toContainText('Route 1');
        await expect(routeCard).toContainText('Stops: 3');
        await expect(routeCard).toContainText('2,000');
    });

    test('E2E-TR-102: Open Create Route Form', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/transport');
        
        await page.click('text=+ Add Route');
        await page.waitForURL('/transport/new');
        
        // Verify fields are visible
        await expect(page.locator('[data-testid="route-name-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="route-number-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="start-point-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="end-point-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="vehicle-number-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="driver-name-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="driver-contact-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="monthly-fee-input"]')).toBeVisible();
    });

    test('E2E-TR-103: Cancel Route Creation', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/transport/new');
        
        await page.click('[data-testid="cancel-btn"]');
        await page.waitForURL('/transport');
        await expect(page).toHaveURL(/.*\/transport/);
    });

    test('E2E-TR-104: Parent Portal My Transport Assigned View', async ({ page }) => {
        const studentId = 'ad50cb20-83f0-42bf-bce6-770addf54375'; // Aarav Sharma
        const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
        
        // Find seeded route and stop
        const routeRes = await runQuery("SELECT id FROM routes WHERE tenant_id = $1 LIMIT 1", [tenantId]);
        const routeId = routeRes.rows[0].id;
        const stopRes = await runQuery("SELECT id FROM stops WHERE route_id = $1 LIMIT 1", [routeId]);
        const stopId = stopRes.rows[0].id;

        // Insert transport assignment for Aarav Sharma
        const stId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
        await runQuery(
            `INSERT INTO student_transport (id, tenant_id, student_id, route_id, stop_id, start_date)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [stId, tenantId, studentId, routeId, stopId, '2026-06-01']
        );

        try {
            await loginAsParent(page);
            await page.goto('/my-transport');
            
            // Verify parent sees assigned route cards
            await expect(page.locator('[data-testid="assigned-routes-list"]')).toBeVisible();
            await expect(page.locator('[data-testid="route-card"]')).toBeVisible();
            await expect(page.locator('[data-testid="route-name"]')).toContainText('Route 1');
        } finally {
            // Clean up
            await runQuery("DELETE FROM student_transport WHERE id = $1", [stId]);
        }
    });

    test('E2E-TR-105: Verify Empty Routes Placeholder', async ({ page }) => {
        // Save current state
        const savedRoutes = await runQuery("SELECT * FROM routes");
        const savedVehicles = await runQuery("SELECT * FROM vehicles");
        const savedStops = await runQuery("SELECT * FROM stops");
        const savedStudentTransports = await runQuery("SELECT * FROM student_transport");

        try {
            // Delete all transport data
            await runQuery("DELETE FROM student_transport");
            await runQuery("DELETE FROM stops");
            await runQuery("DELETE FROM routes");
            await runQuery("DELETE FROM vehicles");

            await loginAsAdmin(page);
            await page.goto('/transport');

            // Assert "No routes configured yet." message is shown
            await expect(page.locator('text=No routes configured yet.')).toBeVisible();
        } finally {
            // Restore database state
            for (const v of savedVehicles.rows) {
                await runQuery(
                    `INSERT INTO vehicles (id, tenant_id, vehicle_number, type, capacity, driver_name, driver_phone, driver_license)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (id) DO NOTHING`,
                    [v.id, v.tenant_id, v.vehicle_number, v.type, v.capacity, v.driver_name, v.driver_phone, v.driver_license]
                );
            }
            for (const r of savedRoutes.rows) {
                await runQuery(
                    `INSERT INTO routes (id, tenant_id, vehicle_id, name, description, morning_departure_time, afternoon_departure_time, monthly_fee)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (id) DO NOTHING`,
                    [r.id, r.tenant_id, r.vehicle_id, r.name, r.description, r.morning_departure_time, r.afternoon_departure_time, r.monthly_fee]
                );
            }
            for (const s of savedStops.rows) {
                await runQuery(
                    `INSERT INTO stops (id, route_id, name, address, latitude, longitude, pickup_time, drop_time, display_order)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (id) DO NOTHING`,
                    [s.id, s.route_id, s.name, s.address, s.latitude, s.longitude, s.pickup_time, s.drop_time, s.display_order]
                );
            }
            for (const st of savedStudentTransports.rows) {
                await runQuery(
                    `INSERT INTO student_transport (id, tenant_id, student_id, route_id, stop_id, start_date, end_date)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING`,
                    [st.id, st.tenant_id, st.student_id, st.route_id, st.stop_id, st.start_date, st.end_date]
                );
            }
        }
    });

    test('E2E-TR-201: Route Create Input Validations', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/transport/new');

        // Click create route without filling fields
        await page.click('[data-testid="submit-btn"]');

        // Verify empty inputs block submission (error messages should be visible)
        await expect(page.locator('text=Route name is required')).toBeVisible();
        await expect(page.locator('text=Route number is required')).toBeVisible();
        await expect(page.locator('text=Start point is required')).toBeVisible();
        await expect(page.locator('text=End point is required')).toBeVisible();
        await expect(page.locator('text=Vehicle number is required')).toBeVisible();
        await expect(page.locator('text=Driver name is required')).toBeVisible();
        await expect(page.locator('text=Driver contact is required')).toBeVisible();
        
        // URL should remain /transport/new
        await expect(page).toHaveURL(/.*\/transport\/new/);
    });

    test('E2E-TR-202: Unassigned Parent Transport View', async ({ page }) => {
        const studentId = 'ad50cb20-83f0-42bf-bce6-770addf54375'; // Aarav Sharma
        
        // Ensure student has no assigned transport
        await runQuery("DELETE FROM student_transport WHERE student_id = $1", [studentId]);

        await loginAsParent(page);
        await page.goto('/my-transport');

        // Verify student with no route shows "No transport assigned."
        await expect(page.locator('[data-testid="unassigned-placeholder"]')).toBeVisible();
        await expect(page.locator('text=No transport assigned.')).toBeVisible();
    });

    test('E2E-TR-203: Invalid Route Details Parameter handling', async ({ page }) => {
        await loginAsAdmin(page);

        // Navigate to non-existent UUID and verify redirect/fallback to /transport
        await page.goto('/transport/d5b5c928-867c-473d-88f5-1bdf3a4bc999');
        await page.waitForURL('/transport');
        await expect(page).toHaveURL(/.*\/transport/);

        // Navigate to non-UUID format and verify redirect
        await page.goto('/transport/non-existent-uuid');
        await page.waitForURL('/transport');
        await expect(page).toHaveURL(/.*\/transport/);
    });

    test('E2E-TR-204: Transport Route Access Restricted for Teacher Role', async ({ page }) => {
        await loginAsTeacher(page);

        // Verify teacher is redirected to /unauthorized when trying to access transport pages
        await page.goto('/transport');
        await page.waitForURL('/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();

        await page.goto('/transport/new');
        await page.waitForURL('/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();
    });

    test('E2E-TR-205: Driver phone format inputs validation', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/transport/new');

        // Fill non-numeric contact
        await page.fill('[data-testid="driver-contact-input"]', 'abc12345');

        // Verify non-numeric phone format warning
        const errorMsg = page.locator('[data-testid="phone-error"]');
        await expect(errorMsg).toBeVisible();
        await expect(errorMsg).toContainText('Invalid contact format');

        // Verify the Create Route button is disabled (blocks submission)
        const submitBtn = page.locator('[data-testid="submit-btn"]');
        await expect(submitBtn).toBeDisabled();
    });

    test('E2E-COM-302: Student Transport route assignment integrates transport fee', async ({ page }) => {
        const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
        const studentId = 'ad50cb20-83f0-42bf-bce6-770addf54375'; // Aarav Sharma

        // Resolve dynamic route and stop IDs from seed data
        const routeRes = await runQuery("SELECT id, monthly_fee FROM routes WHERE tenant_id = $1 LIMIT 1", [tenantId]);
        const routeId = routeRes.rows[0].id;
        const monthlyFee = Number(routeRes.rows[0].monthly_fee);

        const stopRes = await runQuery("SELECT id FROM stops WHERE route_id = $1 LIMIT 1", [routeId]);
        const stopId = stopRes.rows[0].id;

        // Ensure no leftover assignments or invoices exist for Aarav
        await runQuery("DELETE FROM student_transport WHERE student_id = $1", [studentId]);
        await runQuery("DELETE FROM invoices WHERE student_id = $1 AND description = 'Transport Fee'", [studentId]);

        try {
            await loginAsAdmin(page);
            await page.goto(`/transport/${routeId}`);

            // Fill out assignment form
            await page.fill('[data-testid="assign-student-id"]', studentId);
            await page.selectOption('[data-testid="assign-stop-id"]', stopId);
            await page.fill('[data-testid="assign-start-date"]', '2026-07-01');

            await page.click('[data-testid="assign-submit-btn"]');

            // Wait for action and reload/revalidation
            await page.waitForTimeout(1000);
            await page.reload();
            await expect(page.locator('[data-testid="assigned-student-row"]')).toContainText('Aarav Sharma');

            // Verify invoice created in database
            const invoiceCheck = await runQuery(
                `SELECT id, total_amount, status FROM invoices
                 WHERE student_id = $1 AND description = 'Transport Fee'`,
                [studentId]
            );

            expect(invoiceCheck.rows.length).toBe(1);
            expect(Number(invoiceCheck.rows[0].total_amount)).toBe(monthlyFee);
            expect(invoiceCheck.rows[0].status).toBe('PENDING');

            // Verify invoice is displayed on parent portal my-fees page
            await page.context().clearCookies(); // Log out admin
            await loginAsParent(page); // Log in parent (parent@schoolsis.com)
            
            await page.goto('/my-fees');
            await expect(page.locator('table td:has-text("Transport Fee")').first()).toBeVisible();
            await expect(page.locator('table td:has-text("PENDING")').first()).toBeVisible();
        } finally {
            // Clean up
            await runQuery("DELETE FROM student_transport WHERE student_id = $1", [studentId]);
            await runQuery("DELETE FROM invoices WHERE student_id = $1 AND description = 'Transport Fee'", [studentId]);
        }
    });
});
