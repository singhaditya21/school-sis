import { test, expect } from '@playwright/test';

test.describe('Metadata Engine Core (Object Manager)', () => {
  test('Admin can create a custom field', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login');
    // Using placeholder as fallback if label is not strictly defined
    const emailInput = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i));
    await emailInput.fill('admin@school.com');
    
    const passwordInput = page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i));
    await passwordInput.fill('password');
    
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    // 2. Go to /settings/objects
    await page.goto('/settings/objects');

    // 3. Verify the "Object Manager" header is visible.
    await expect(page.getByRole('heading', { name: /Object Manager/i })).toBeVisible();

    // 4. Click on the "Student" object card to view its fields.
    await page.getByText('Student', { exact: true }).click();

    // 5. Create a new custom field called "Hobbies" of type "TEXT".
    await page.getByRole('button', { name: /add field|new field/i }).click();
    await page.getByLabel(/name|field name/i).fill('Hobbies');
    
    // Select type (trying standard select option first, falling back to typical click-and-select)
    try {
        await page.getByLabel(/type|field type/i).selectOption('TEXT');
    } catch (e) {
        await page.getByLabel(/type|field type/i).click();
        await page.getByText('TEXT', { exact: true }).click();
    }

    await page.getByRole('button', { name: /save|create/i }).click();

    // 6. Verify "Hobbies" appears in the field list.
    await expect(page.getByText('Hobbies', { exact: true })).toBeVisible();
  });
});
