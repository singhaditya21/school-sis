import { test, expect } from '@playwright/test';

test.describe('Fees & Invoices', () => {
  test('Complete flow: Login, view fees, and create invoice', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login'); // Adjust login URL as needed
    
    // Fill credentials
    await page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).fill('admin@school.com');
    await page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i)).fill('password');
    await page.getByRole('button', { name: /login|submit|sign in/i }).click();

    // Wait for some navigation indicating successful login (e.g. dashboard)
    await page.waitForLoadState('networkidle');

    // 2. Go to `/fees`
    await page.goto('/fees');

    // 3. Verify the dashboard loads and shows fee stats.
    await expect(page).toHaveURL(/.*\/fees/);
    await expect(page.getByText(/stats|statistics|total/i).first()).toBeVisible();

    // 4. Go to `/app/invoice`
    await page.goto('/app/invoice');

    // 5. Verify the Invoice List view loads (since it's a generic metadata object now).
    await expect(page).toHaveURL(/.*\/app\/invoice/);
    await expect(page.getByRole('heading', { name: /invoice/i }).or(page.getByRole('table'))).toBeVisible();

    // 6. Click "New Record" to open the dynamic invoice form.
    await page.getByRole('button', { name: /new record/i }).click();

    // 7. Fill out Student ID and Total Amount, and submit.
    await page.getByLabel(/student id/i).fill('STU-1001');
    await page.getByLabel(/total amount/i).fill('500');
    
    await page.getByRole('button', { name: /submit|save|create/i }).click();

    // 8. Verify it returns to the list view.
    await page.waitForURL(/.*\/app\/invoice/);
    await expect(page).toHaveURL(/.*\/app\/invoice/);
  });
});
