import { test, expect } from '@playwright/test';

test.describe('Metadata Engine Core (Object Manager)', () => {
  test('Admin can create a custom field', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login');
    // Using placeholder as fallback if label is not strictly defined
    const emailInput = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i));
    await emailInput.fill('admin@greenwood.edu');
    
    const passwordInput = page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i));
    await passwordInput.fill('password');
    
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    // Wait for the dashboard redirect to ensure we are logged in
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });

    // 2. Go to /settings/objects
    await page.goto('/settings/objects');

    // 3. Verify the "Object Manager" header is visible.
    await expect(page.getByRole('heading', { name: /Object Manager/i })).toBeVisible();

    // 4. Click on the "Student" object card to view its fields.
    await page.getByRole('link', { name: /student/i }).filter({ hasText: 'API Name: student' }).click();
    await page.waitForURL(/\/settings\/objects\/.+/);

    // 5. Create a new custom field called "Hobbies" of type "TEXT".
    await page.getByRole('button', { name: /add field|new field|new custom field/i }).click();
    await page.getByPlaceholder('e.g. Blood Group').fill('Hobbies');
    await page.getByPlaceholder('e.g. blood_group').fill('hobbies');
    
    // Select type
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Text', exact: true }).click();

    await page.getByRole('button', { name: /create field/i }).click();

    // 6. Verify "Hobbies" appears in the field list.
    await expect(page.getByText('Hobbies', { exact: true })).toBeVisible();
  });
});
