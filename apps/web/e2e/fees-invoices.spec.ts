import { test, expect } from '@playwright/test';

test.describe('Fees & Invoices', () => {
  test('Complete flow: Login, view fees, and create invoice', async ({ page }) => {
    page.on('console', msg => console.log('FEES BROWSER CONSOLE:', msg.text()));
    // 1. Login as admin
    await page.goto('/login'); // Adjust login URL as needed
    
    // Fill credentials
    await page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).fill('admin@greenwood.edu');
    await page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i)).fill('password');
    await page.getByRole('button', { name: /login|submit|sign in/i }).click();

    // Wait for some navigation indicating successful login (e.g. dashboard)
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 15000 });

    // 2. Go to `/fees`
    await page.goto('/fees');

    // 3. Verify the dashboard loads and shows fee stats.
    await expect(page).toHaveURL(/.*\/fees/);
    await expect(page.getByText(/stats|statistics|total/i).first()).toBeVisible();

    // 4. Go to `/app/invoice`
    await page.goto('/app/invoice', { timeout: 45000 });

    // 5. Verify the Invoice List view loads (since it's a generic metadata object now).
    await expect(page).toHaveURL(/.*\/app\/invoice/);
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

    // 6. Click "New Record" to open the dynamic invoice form.
    await page.getByRole('link', { name: /new record/i }).click();
    await page.waitForURL(/.*\/app\/invoice\/new/);

    // 7. Fill out Student ID and Total Amount, and other required fields, then submit.
    await page.getByLabel(/invoice number/i).fill(`INV-2026-${Math.floor(Math.random() * 1000000)}`);
    await page.getByLabel(/student id/i).fill('STU-1001');
    await page.getByLabel(/total amount/i).fill('500');
    await page.getByLabel(/due date/i).fill('2026-06-30');
    
    await page.getByRole('combobox', { name: /status/i }).selectOption('PAID');
    
    await page.getByRole('button', { name: /submit|save|create/i }).click();

    // 8. Verify it returns to the list view.
    await page.waitForURL(/.*\/app\/invoice$/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/app\/invoice$/, { timeout: 15000 });
  });
});
