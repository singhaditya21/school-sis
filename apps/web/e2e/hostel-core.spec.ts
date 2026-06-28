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

test.describe('Hostel Core E2E Tests', () => {
    
    // TIER 1 tests
    
    test('E2E-HS-101: Hostel Dashboard loading and KPI cards', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel');
        await expect(page.locator('main h1')).toContainText('Hostel Management');
        
        const kpiGrid = page.locator('.grid-cols-2.md\\:grid-cols-5');
        await expect(kpiGrid.getByText('Total Hostels', { exact: true })).toBeVisible();
        await expect(kpiGrid.getByText('Total Beds', { exact: true })).toBeVisible();
        await expect(kpiGrid.getByText('Occupied', { exact: true })).toBeVisible();
        await expect(kpiGrid.getByText('Available', { exact: true })).toBeVisible();
        await expect(kpiGrid.getByText('Occupancy', { exact: true })).toBeVisible();
    });

    test('E2E-HS-102: View active allocations table', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel');
        await expect(page.locator('h3:has-text("Active Allocations")')).toBeVisible();
        await expect(page.locator('table th:has-text("Student")')).toBeVisible();
        await expect(page.locator('table th:has-text("Hostel")')).toBeVisible();
        await expect(page.locator('table th:has-text("Room")')).toBeVisible();
        await expect(page.locator('table th:has-text("Bed")')).toBeVisible();
        await expect(page.locator('table th:has-text("Period")')).toBeVisible();
        
        await expect(page.locator('table td:has-text("Aarav Sharma")')).toBeVisible();
        await expect(page.locator('table td:has-text("Nilgiri Boys Hostel")')).toBeVisible();
        await expect(page.locator('table td:has-text("101")')).toBeVisible();
        await expect(page.getByRole('cell', { name: 'A', exact: true })).toBeVisible();
    });

    test('E2E-HS-103: Filter hostel fees by status paid', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        const statusSelect = page.locator('select').first();
        await statusSelect.selectOption('paid');
        await expect(page.locator('table tbody tr td:has-text("paid")').first()).toBeVisible();
        await expect(page.locator('table tbody tr td:has-text("pending")')).toHaveCount(0);
    });

    test('E2E-HS-104: Filter hostel fees by fee type mess', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        const typeSelect = page.locator('select').nth(1);
        await typeSelect.selectOption('mess');
        
        // Fee Type is the 3rd column (nth-child(3))
        await expect(page.locator('table tbody tr td:nth-child(3):has-text("mess")').first()).toBeVisible();
        await expect(page.locator('table tbody tr td:nth-child(3):has-text("hostel")')).toHaveCount(0);
    });

    test('E2E-HS-105: Clear hostel fees filters', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        const statusSelect = page.locator('select').first();
        await statusSelect.selectOption('paid');
        const clearBtn = page.locator('button:has-text("Clear")');
        await clearBtn.click();
        await expect(statusSelect).toHaveValue('');
        await expect(page.locator('table tbody tr')).toHaveCount(2);
    });

    // TIER 2 tests

    test('E2E-HS-201: Fee list empty state with overdue filter', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/hostel/fees');
        const statusSelect = page.locator('select').first();
        await statusSelect.selectOption('overdue');
        await expect(page.locator('text=No fee records found.')).toBeVisible();
    });

    test('E2E-HS-202: Unauthenticated user redirection to login', async ({ page }) => {
        await page.context().clearCookies();
        await page.goto('/hostel');
        await page.waitForURL(url => url.pathname === '/login');
        await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    });

    test('E2E-HS-203: Access restricted for Parent role (redirects to unauthorized)', async ({ page }) => {
        await loginAsParent(page);
        await page.goto('/hostel');
        await page.waitForURL(url => url.pathname === '/unauthorized');
        await expect(page.locator('text=Unauthorized')).toBeVisible();
    });

    test('E2E-HS-204: Occupancy Rate displays "0%" when there are no active allocations', async ({ page }) => {
        // Save database state
        await runQuery("DELETE FROM hostel_allocations WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'");
        await runQuery("UPDATE hostels SET occupied_beds = 0 WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'");
        await runQuery("UPDATE hostel_rooms SET occupied_beds = 0, status = 'AVAILABLE' WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'");
        
        try {
            await loginAsAdmin(page);
            await page.goto('/hostel');
            await expect(page.locator('text=0%')).toBeVisible();
        } finally {
            // Restore database state
            await runQuery("UPDATE hostels SET occupied_beds = 1 WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'");
            await runQuery("UPDATE hostel_rooms SET occupied_beds = 1, status = 'AVAILABLE' WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'");
            await runQuery(`
                INSERT INTO hostel_allocations (id, tenant_id, student_id, hostel_id, room_id, bed_number, allocated_from, allocated_to, status)
                VALUES ('d5b5c928-867c-473d-88f5-1bdf3a4bc062', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 
                 (SELECT id FROM students WHERE first_name = 'Aarav' AND last_name = 'Sharma' AND tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35' LIMIT 1), 
                 'd5b5c928-867c-473d-88f5-1bdf3a4bc060', 'd5b5c928-867c-473d-88f5-1bdf3a4bc061', 'A', '2026-06-01', '2027-05-31', 'ACTIVE')
            `);
        }
    });

    test('E2E-HS-205: Verify Mess Menu weekly meal scheduler display (e.g. days sorted Monday-Sunday)', async ({ page }) => {
        // Seed sorted menus
        await runQuery("DELETE FROM mess_menus WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'");
        await runQuery(`
            INSERT INTO mess_menus (id, tenant_id, hostel_id, day, breakfast, lunch, snacks, dinner)
            VALUES
            ('d5b5c928-867c-473d-88f5-1bdf3a4bc081', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc060', 'Monday', 'Poha', 'Roti Sabzi', 'Tea Biscuits', 'Dal Rice'),
            ('d5b5c928-867c-473d-88f5-1bdf3a4bc082', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc060', 'Wednesday', 'Idli', 'Rice Sambar', 'Filter Coffee', 'Roti Paneer'),
            ('d5b5c928-867c-473d-88f5-1bdf3a4bc083', '0c413c23-6f0f-40ab-bd41-73e6e996ff35', 'd5b5c928-867c-473d-88f5-1bdf3a4bc060', 'Sunday', 'Aloo Paratha', 'Chole Bhature', 'Samosa Tea', 'Biryani')
        `);
        
        try {
            await loginAsAdmin(page);
            await page.goto('/hostel');
            
            const monday = page.locator('[data-testid="mess-menu-day-monday"]');
            const wednesday = page.locator('[data-testid="mess-menu-day-wednesday"]');
            const sunday = page.locator('[data-testid="mess-menu-day-sunday"]');
            
            await expect(monday).toBeVisible();
            await expect(wednesday).toBeVisible();
            await expect(sunday).toBeVisible();
            
            const monBox = await monday.boundingBox();
            const wedBox = await wednesday.boundingBox();
            const sunBox = await sunday.boundingBox();
            
            if (monBox && wedBox && sunBox) {
                expect(monBox.y).toBeLessThan(wedBox.y);
                expect(wedBox.y).toBeLessThan(sunBox.y);
            }
        } finally {
            await runQuery("DELETE FROM mess_menus WHERE tenant_id = '0c413c23-6f0f-40ab-bd41-73e6e996ff35'");
        }
    });

    // TIER 3 tests

    test('E2E-COM-301: Hostel Room Allocation triggers Hostel Fee Creation (Cross-Feature)', async ({ page }) => {
        // Fetch unallocated student Vivaan
        const studentRes = await runQuery("SELECT id FROM students WHERE first_name = 'Vivaan' LIMIT 1");
        const studentId = studentRes.rows[0].id;
        const hostelId = 'd5b5c928-867c-473d-88f5-1bdf3a4bc060';
        const roomId = 'd5b5c928-867c-473d-88f5-1bdf3a4bc061';
        
        try {
            await loginAsAdmin(page);
            await page.goto('/hostel');
            
            // Fill allocation form
            await page.fill('[data-testid="alloc-student-id"]', studentId);
            await page.fill('[data-testid="alloc-hostel-id"]', hostelId);
            await page.fill('[data-testid="alloc-room-id"]', roomId);
            await page.fill('[data-testid="alloc-bed-number"]', 'B');
            await page.fill('[data-testid="alloc-from"]', '2026-07-01');
            await page.fill('[data-testid="alloc-to"]', '2027-06-30');
            
            await page.click('[data-testid="allocate-submit-btn"]');
            
            // Wait for reload
            await page.waitForTimeout(1000);
            
            // Verify allocation in DB
            const allocCheck = await runQuery("SELECT id FROM hostel_allocations WHERE student_id = $1 AND status = 'ACTIVE'", [studentId]);
            expect(allocCheck.rows.length).toBe(1);
            
            // Verify auto generated hostel fee in DB
            const feeCheck = await runQuery("SELECT id, amount, status FROM hostel_fees WHERE student_id = $1 AND fee_type = 'hostel'", [studentId]);
            expect(feeCheck.rows.length).toBe(1);
            expect(Number(feeCheck.rows[0].amount)).toBe(15000.00);
            expect(feeCheck.rows[0].status).toBe('pending');
            
            // Verify new fee displayed on UI
            await page.goto('/hostel/fees');
            await expect(page.locator('table td:has-text("Vivaan Verma")').first()).toBeVisible();
            await expect(page.locator('table td:has-text("pending")').first()).toBeVisible();
        } finally {
            // Clean up
            await runQuery("DELETE FROM hostel_allocations WHERE student_id = $1", [studentId]);
            await runQuery("DELETE FROM hostel_fees WHERE student_id = $1", [studentId]);
            await runQuery("UPDATE hostels SET occupied_beds = 1 WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc060'");
            await runQuery("UPDATE hostel_rooms SET occupied_beds = 1, status = 'AVAILABLE'::room_status WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc061'");
        }
    });

    // TIER 4 tests

    test('E2E-WRK-401: Hostel Vacating & Waitlist Reallocation workflow (Real-World Workload)', async ({ page }) => {
        // Fetch different student Ananya for waitlist to prevent parallel test collisions
        const studentRes = await runQuery("SELECT id, first_name || ' ' || last_name AS name FROM students WHERE first_name = 'Ananya' LIMIT 1");
        const studentId = studentRes.rows[0].id;
        const studentFullName = studentRes.rows[0].name; // Ananya Singh
        const pendingAllocId = 'a5b5c928-867c-473d-88f5-1bdf3a4bc099';
        
        // Insert a PENDING waitlist allocation for Ananya
        await runQuery(
            `INSERT INTO hostel_allocations (id, tenant_id, student_id, hostel_id, room_id, bed_number, allocated_from, allocated_to, status, created_at) 
             VALUES ($1, '0c413c23-6f0f-40ab-bd41-73e6e996ff35', $2, 'd5b5c928-867c-473d-88f5-1bdf3a4bc060', 'd5b5c928-867c-473d-88f5-1bdf3a4bc061', 'B', '2026-07-01', '2027-06-30', 'PENDING', NOW())`,
            [pendingAllocId, studentId]
        );
        
        try {
            await loginAsAdmin(page);
            await page.goto('/hostel');
            
            // Vacate Aarav Sharma (current active allocation)
            const vacateBtn = page.locator('[data-testid="vacate-btn-d5b5c928-867c-473d-88f5-1bdf3a4bc062"]');
            await vacateBtn.click();
            
            // Wait for action to complete
            await page.waitForTimeout(1000);
            
            // Verify Aarav's allocation is VACATED
            const oldAlloc = await runQuery("SELECT status FROM hostel_allocations WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc062'");
            expect(oldAlloc.rows[0].status).toBe('VACATED');
            
            // Verify Ananya's allocation is now ACTIVE
            const newAlloc = await runQuery("SELECT status FROM hostel_allocations WHERE id = $1", [pendingAllocId]);
            expect(newAlloc.rows[0].status).toBe('ACTIVE');
            
            await page.reload();
            
            // Verify Ananya is now visible in the active allocations table and Aarav Sharma is not
            await expect(page.locator(`table td:has-text("${studentFullName}")`)).toBeVisible();
            await expect(page.locator('table td:has-text("Aarav Sharma")')).toHaveCount(0);
        } finally {
            // Restore db state
            await runQuery("DELETE FROM hostel_allocations WHERE id = $1", [pendingAllocId]);
            await runQuery("DELETE FROM hostel_fees WHERE student_id = $1", [studentId]);
            await runQuery("UPDATE hostel_allocations SET status = 'ACTIVE' WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc062'");
            await runQuery("UPDATE hostels SET occupied_beds = 1 WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc060'");
            await runQuery("UPDATE hostel_rooms SET occupied_beds = 1, status = 'AVAILABLE'::room_status WHERE id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc061'");
        }
    });
});
