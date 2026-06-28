import { test, expect } from '@playwright/test';

test.describe('Staff/HR Module', () => {
  test('should create a new staff profile', async ({ page }) => {
    page.on('console', msg => console.log('STAFF BROWSER CONSOLE:', msg.text()));
    // 1. Login as admin (email: admin@greenwood.edu, password: password)
    await page.goto('/login');
    await page.getByLabel(/email/i).or(page.locator('input[type="email"]')).fill('admin@greenwood.edu');
    await page.getByLabel(/password/i).or(page.locator('input[type="password"]')).fill('password');
    await page.getByRole('button', { name: /login|sign in|submit/i }).click();

    // Wait for the dashboard redirect to ensure we are logged in
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });

    // 2. Go to `/app/staff`
    await page.goto('/app/staff');

    // 3. Verify the Generic Object List view loads for Staff profiles.
    await expect(page).toHaveURL(/.*\/app\/staff/);
    await expect(page.getByRole('heading', { name: 'Staffs' })).toBeVisible();

    // 4. Click "New Record".
    await page.getByRole('link', { name: /New Record/i }).click();
    await page.waitForURL(/.*\/app\/staff\/new/);

    // 5. Fill out First Name, Last Name, and Employee ID.
    const randId = Math.floor(Math.random() * 1000000);
    const employeeId = `EMP-${randId}`;
    await page.getByLabel(/First Name/i).fill('Test');
    await page.getByLabel(/Last Name/i).fill('User');
    await page.getByLabel(/Employee ID/i).fill(employeeId);

    // 6. Submit the form.
    await page.getByRole('button', { name: /submit|save|create/i }).click();

    // 7. Verify it returns to the list view.
    await expect(page).toHaveURL(/.*\/app\/staff$/, { timeout: 15000 });
    await expect(page.getByText(employeeId)).toBeVisible({ timeout: 15000 });
  });
});
