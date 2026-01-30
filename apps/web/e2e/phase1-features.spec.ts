/**
 * E2E Test Scenarios for SIS Phase 1
 * 
 * These tests use Playwright to test full user workflows.
 * Run with: npx playwright test
 */

import { test, expect } from '@playwright/test';

test.describe('Teacher Portal E2E', () => {
    test.beforeEach(async ({ page }) => {
        // Login as teacher
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'teacher@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'teacher123');
        await page.click('[data-testid="login-button"]');
        await page.waitForURL('/teacher/dashboard');
    });

    test('E2E-T001: Complete daily attendance workflow', async ({ page }) => {
        // 1. Verify dashboard loads
        await expect(page.locator('h1')).toContainText('Good');
        await expect(page.locator('[data-testid="classes-today"]')).toBeVisible();

        // 2. Check today's schedule
        await expect(page.locator('[data-testid="schedule-section"]')).toBeVisible();

        // 3. Click on Take Attendance quick action
        await page.click('text=Take Attendance');
        await page.waitForURL('/teacher/attendance');

        // 4. Select class
        await page.selectOption('[data-testid="class-select"]', '10-A');

        // 5. Select period
        await page.selectOption('[data-testid="period-select"]', '1');

        // 6. Wait for student list
        await expect(page.locator('[data-testid="student-list"]')).toBeVisible();

        // 7. Mark all present
        await page.click('text=Mark All Present');

        // 8. Verify counts updated
        await expect(page.locator('[data-testid="present-count"]')).toContainText('30');
        await expect(page.locator('[data-testid="absent-count"]')).toContainText('0');

        // 9. Submit attendance
        await page.click('text=Submit Attendance');

        // 10. Verify success message
        await expect(page.locator('[data-testid="toast"]')).toContainText('saved successfully');
    });

    test('E2E-T002: Enter and save exam marks', async ({ page }) => {
        // Navigate to gradebook
        await page.click('text=Gradebook');
        await page.waitForURL('/teacher/gradebook');

        // Select class and exam
        await page.selectOption('[data-testid="class-select"]', '10-A');
        await page.selectOption('[data-testid="exam-select"]', 'Mid-Term 2026');

        // Wait for marks table
        await expect(page.locator('[data-testid="marks-table"]')).toBeVisible();

        // Enter marks for first 3 students
        const marksInputs = page.locator('[data-testid="marks-input"]');
        await marksInputs.nth(0).fill('85');
        await marksInputs.nth(1).fill('72');
        await marksInputs.nth(2).fill('91');

        // Verify grades auto-calculated
        await expect(page.locator('[data-testid="grade-cell"]').nth(0)).toContainText('A');
        await expect(page.locator('[data-testid="grade-cell"]').nth(1)).toContainText('B+');
        await expect(page.locator('[data-testid="grade-cell"]').nth(2)).toContainText('A+');

        // Save marks
        await page.click('text=Save Marks');

        // Verify success
        await expect(page.locator('[data-testid="toast"]')).toContainText('saved');
    });

    test('Should display weekly schedule correctly', async ({ page }) => {
        await page.click('text=Schedule');
        await page.waitForURL('/teacher/schedule');

        // Verify days displayed
        await expect(page.locator('text=Monday')).toBeVisible();
        await expect(page.locator('text=Tuesday')).toBeVisible();
        await expect(page.locator('text=Wednesday')).toBeVisible();
        await expect(page.locator('text=Thursday')).toBeVisible();
        await expect(page.locator('text=Friday')).toBeVisible();

        // Verify has class entries
        await expect(page.locator('[data-testid="schedule-entry"]').first()).toBeVisible();
    });
});

test.describe('Payment Gateway E2E', () => {
    test.beforeEach(async ({ page }) => {
        // Login as parent
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'parent@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'parent123');
        await page.click('[data-testid="login-button"]');
        await page.waitForURL('/overview');
    });

    test('E2E-P001: Complete fee payment flow', async ({ page }) => {
        // Navigate to My Fees
        await page.click('text=My Fees');
        await page.waitForURL('/my-fees');

        // Verify pending invoices displayed
        await expect(page.locator('[data-testid="pending-invoices"]')).toBeVisible();
        await expect(page.locator('text=INV-2026-001')).toBeVisible();

        // Click Pay Now
        await page.locator('[data-testid="pay-now-btn"]').first().click();

        // Payment modal should open
        await expect(page.locator('[data-testid="payment-modal"]')).toBeVisible();

        // Verify default amount
        const amountInput = page.locator('[data-testid="amount-input"]');
        await expect(amountInput).toHaveValue('45000');

        // Click Pay button
        await page.click('[data-testid="proceed-payment-btn"]');

        // In demo mode, should show success after brief delay
        await expect(page.locator('text=Payment Successful')).toBeVisible({ timeout: 5000 });
    });

    test('Should display payment history', async ({ page }) => {
        await page.click('text=My Fees');
        await page.waitForURL('/my-fees');

        // Switch to history tab
        await page.click('text=Payment History');

        // Verify history displayed
        await expect(page.locator('[data-testid="payment-history"]')).toBeVisible();
        await expect(page.locator('text=PAY-2025-089')).toBeVisible();
    });

    test('Should validate payment amount', async ({ page }) => {
        await page.click('text=My Fees');
        await page.waitForURL('/my-fees');

        // Open payment modal
        await page.locator('[data-testid="pay-now-btn"]').first().click();

        // Try to enter invalid amount
        const amountInput = page.locator('[data-testid="amount-input"]');
        await amountInput.fill('0');

        // Should show error
        await expect(page.locator('[data-testid="amount-error"]')).toBeVisible();

        // Pay button should be disabled
        await expect(page.locator('[data-testid="proceed-payment-btn"]')).toBeDisabled();
    });
});

test.describe('Library Management E2E', () => {
    test.beforeEach(async ({ page }) => {
        // Login as librarian/admin
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'admin123');
        await page.click('[data-testid="login-button"]');
        await page.waitForURL('/dashboard');
    });

    test('E2E-L001: Issue book to student', async ({ page }) => {
        // Navigate to Library
        await page.click('text=Library');
        await page.waitForURL('/library');

        // Verify book catalog displayed
        await expect(page.locator('[data-testid="book-grid"]')).toBeVisible();

        // Search for a book
        await page.fill('[data-testid="search-input"]', 'Mathematics');

        // Wait for search results
        await expect(page.locator('text=Mathematics for Class 10')).toBeVisible();

        // Click on book
        await page.click('text=Mathematics for Class 10');

        // Book detail dialog should open
        await expect(page.locator('[data-testid="book-dialog"]')).toBeVisible();
        await expect(page.locator('[data-testid="available-copies"]')).toContainText('42');

        // Click Issue Book
        await page.click('text=Issue Book');

        // Student search should appear
        await expect(page.locator('[data-testid="student-search"]')).toBeVisible();

        // Search student
        await page.fill('[data-testid="student-search"]', 'Aarav');
        await page.click('text=Aarav Sharma - 10-A');

        // Set loan period
        await page.selectOption('[data-testid="loan-period"]', '14');

        // Confirm issue
        await page.click('[data-testid="confirm-issue-btn"]');

        // Verify success
        await expect(page.locator('[data-testid="toast"]')).toContainText('issued successfully');

        // Available copies should decrease
        await expect(page.locator('[data-testid="available-copies"]')).toContainText('41');
    });

    test('Should search books by different criteria', async ({ page }) => {
        await page.click('text=Library');
        await page.waitForURL('/library');

        // Search by title
        await page.fill('[data-testid="search-input"]', 'Wings of Fire');
        await expect(page.locator('text=Wings of Fire')).toBeVisible();

        // Clear and search by author
        await page.fill('[data-testid="search-input"]', 'R.D. Sharma');
        await expect(page.locator('text=Mathematics for Class 10')).toBeVisible();

        // Search by ISBN
        await page.fill('[data-testid="search-input"]', '978-0-13-468599-1');
        await expect(page.locator('text=Mathematics for Class 10')).toBeVisible();
    });

    test('Should filter books by category', async ({ page }) => {
        await page.click('text=Library');
        await page.waitForURL('/library');

        // Filter by FICTION
        await page.selectOption('[data-testid="category-filter"]', 'FICTION');

        // Should show only fiction books
        await expect(page.locator('text=The God of Small Things')).toBeVisible();
        await expect(page.locator('text=To Kill a Mockingbird')).toBeVisible();

        // Should not show textbooks
        await expect(page.locator('text=Mathematics for Class 10')).not.toBeVisible();
    });

    test('Should display library statistics', async ({ page }) => {
        await page.click('text=Library');
        await page.waitForURL('/library');

        // Stats cards should be visible
        await expect(page.locator('[data-testid="total-books"]')).toBeVisible();
        await expect(page.locator('[data-testid="available-copies"]')).toBeVisible();
        await expect(page.locator('[data-testid="issued-today"]')).toBeVisible();
        await expect(page.locator('[data-testid="overdue-books"]')).toBeVisible();
    });

    test('Should show overdue books list', async ({ page }) => {
        await page.click('text=Library');
        await page.waitForURL('/library');

        // Navigate to overdue section
        await page.click('text=Overdue');

        // Should show overdue books
        await expect(page.locator('[data-testid="overdue-list"]')).toBeVisible();
        await expect(page.locator('[data-testid="fine-amount"]').first()).toBeVisible();
    });
});

test.describe('Cross-Module Integration E2E', () => {
    test('TC-X002: Fee payment updates invoice status', async ({ page }) => {
        // Login as parent
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'parent@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'parent123');
        await page.click('[data-testid="login-button"]');

        // Navigate to fees
        await page.click('text=My Fees');

        // Note invoice status
        await expect(page.locator('text=PENDING').first()).toBeVisible();

        // Make payment
        await page.locator('[data-testid="pay-now-btn"]').first().click();
        await page.click('[data-testid="proceed-payment-btn"]');

        // Wait for success
        await expect(page.locator('text=Payment Successful')).toBeVisible({ timeout: 5000 });

        // Close success dialog
        await page.click('[data-testid="close-success-btn"]');

        // Invoice should now show as paid in history
        await page.click('text=Payment History');
        await expect(page.locator('text=SUCCESS').first()).toBeVisible();
    });
});

test.describe('Authentication & RBAC E2E', () => {
    test('Should redirect unauthorized users to login', async ({ page }) => {
        // Try to access protected route without login
        await page.goto('/teacher/dashboard');

        // Should redirect to login
        await expect(page).toHaveURL(/login/);
    });

    test('Should deny parent access to teacher routes', async ({ page }) => {
        // Login as parent
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'parent@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'parent123');
        await page.click('[data-testid="login-button"]');

        // Try to access teacher dashboard
        await page.goto('/teacher/dashboard');

        // Should redirect or show access denied
        await expect(page.locator('text=Access Denied')).toBeVisible();
    });

    test('Should allow admin access to all routes', async ({ page }) => {
        // Login as admin
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
        await page.fill('[data-testid="password-input"]', 'admin123');
        await page.click('[data-testid="login-button"]');

        // Should be able to access admin dashboard
        await page.goto('/dashboard');
        await expect(page.locator('h1')).toContainText('Dashboard');

        // Should be able to access library
        await page.goto('/library');
        await expect(page.locator('h1')).toContainText('Library');
    });
});
