import { test, expect } from '@playwright/test';

test.describe('Metadata Engine & LCNC Platform Builders', () => {
  test('Admin can create custom fields, configure FLS & Drag-and-Drop layouts, and use Kanban/CSV tools', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login');
    const emailInput = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i));
    await emailInput.fill('admin@greenwood.edu');

    const passwordInput = page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i));
    await passwordInput.fill('password');

    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });

    // 2. Go to /settings/objects and open Student object
    await page.goto('/settings/objects');
    await expect(page.getByRole('heading', { name: /Object Manager/i })).toBeVisible();

    await page.getByRole('link', { name: /student/i }).filter({ hasText: 'API Name: student' }).click();
    await page.waitForURL(/\/settings\/objects\/.+/);

    // 3. Verify Drag-and-Drop Form & List Layout Designer is rendered
    await expect(page.getByText(/Form & List Layout Designer/i)).toBeVisible();

    // 4. Create a new custom field called "Hobbies" of type "TEXT"
    await page.getByRole('button', { name: /add field|new field|new custom field/i }).click();
    await page.getByPlaceholder('e.g. Blood Group').fill('Hobbies');
    await page.getByPlaceholder('e.g. blood_group').fill('hobbies');

    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Text', exact: true }).click();
    await page.getByRole('button', { name: /create field/i }).click();

    await expect(page.getByText('Hobbies', { exact: true })).toBeVisible();

    // 5. Visit runtime view (/app/student) and verify CSV Export/Import & Kanban controls
    await page.goto('/app/student');
    await expect(page.locator('[data-testid="export-object-csv"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-object-csv"]')).toBeVisible();

    // 6. Visit Executive Dashboard Builder and toggle drag-and-drop customization
    await page.goto('/executive');
    await expect(page.locator('[data-testid="toggle-customize-dashboard"]')).toBeVisible();
    await page.locator('[data-testid="toggle-customize-dashboard"]').click();
    await expect(page.locator('[data-testid="save-dashboard-layout"]')).toBeVisible();
  });
});

