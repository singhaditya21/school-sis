import { test, expect } from '@playwright/test';

test.describe('Staff/HR Module', () => {
  test('should create a new staff profile', async ({ page }) => {
    // 1. Login as admin (email: admin@school.com, password: password)
    await page.goto('/login');
    await page.getByLabel(/email/i).or(page.locator('input[type="email"]')).fill('admin@school.com');
    await page.getByLabel(/password/i).or(page.locator('input[type="password"]')).fill('password');
    await page.getByRole('button', { name: /login|sign in|submit/i }).click();

    // Wait for successful login (optional, but good practice to wait before direct navigation if needed)
    await page.waitForLoadState('networkidle');

    // 2. Go to `/app/staff`
    await page.goto('/app/staff');

    // 3. Verify the Generic Object List view loads for Staff profiles.
    await expect(page).toHaveURL(/.*\/app\/staff/);
    await expect(page.getByRole('heading', { name: /staff/i }).or(page.locator('text=Staff').first())).toBeVisible();

    // 4. Click "New Record".
    await page.getByRole('button', { name: /New Record/i }).click();

    // 5. Fill out First Name, Last Name, and Employee ID.
    await page.getByLabel(/First Name/i).fill('Test');
    await page.getByLabel(/Last Name/i).fill('User');
    await page.getByLabel(/Employee ID/i).fill('EMP-12345');

    // 6. Submit the form.
    await page.getByRole('button', { name: /submit|save|create/i }).click();

    // 7. Verify it returns to the list view.
    await expect(page).toHaveURL(/.*\/app\/staff$/);
    await expect(page.getByText('EMP-12345')).toBeVisible();
  });
});
