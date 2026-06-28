import { test, expect } from '@playwright/test';

test('Students Module - Create New Record', async ({ page }) => {
  // 1. Login as admin
  await page.goto('/login');
  
  // Try common locators for email and password
  const emailInput = page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).or(page.locator('input[type="email"]'));
  await emailInput.fill('admin@school.com');
  
  const passwordInput = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i)).or(page.locator('input[type="password"]'));
  await passwordInput.fill('password');
  
  await page.getByRole('button', { name: /login|sign in/i }).click();

  // Wait for login to complete and navigate
  await page.waitForNavigation();

  // 2. Go to `/app/student`
  await page.goto('/app/student');

  // 3. Verify the Generic Object List view loads for Students.
  await expect(page).toHaveURL(/.*\/app\/student/);
  // Look for a heading or generic list indicator
  await expect(page.getByRole('heading', { name: /student/i })).toBeVisible();

  // 4. Click "New Record".
  await page.getByRole('button', { name: /new record/i }).click();

  // 5. Fill out a First Name, Last Name, Admission Number, and Enrollment Date.
  await page.getByLabel(/first name/i).fill('John');
  await page.getByLabel(/last name/i).fill('Doe');
  await page.getByLabel(/admission number/i).fill('ADM-2026-001');
  await page.getByLabel(/enrollment date/i).fill('2026-09-01');

  // 6. Submit the form.
  await page.getByRole('button', { name: /submit|save/i }).click();

  // 7. Verify it returns to the list view.
  await expect(page).toHaveURL(/.*\/app\/student/);
  await expect(page.getByRole('heading', { name: /student/i })).toBeVisible();
});
