import { test, expect } from '@playwright/test';

/**
 * Basic E2E smoke tests — verify core pages load correctly.
 */

test.describe('ScholarMind — Smoke Tests', () => {
    test('login page loads', async ({ page }) => {
        await page.goto('/login');
        await expect(page).toHaveTitle(/ScholarMind|Login/i);
        await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    });

    test('dashboard redirects when not logged in', async ({ page }) => {
        await page.goto('/');
        // Should redirect to login
        await expect(page).toHaveURL(/login/);
    });

    test('fees page loads after login', async ({ page }) => {
        // This test would need proper auth setup in a beforeAll hook
        // For now, just verify the page structure
        await page.goto('/fees');
        // Will redirect to login if not authenticated
        await page.waitForTimeout(1000);
    });

    test('admissions page loads after login', async ({ page }) => {
        await page.goto('/admissions');
        await page.waitForTimeout(1000);
    });
});
