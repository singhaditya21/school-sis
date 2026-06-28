import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Helper function to execute a database query and immediately close the pool to prevent connection leaks
async function runQuery(text: string, params?: any[]) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        idleTimeoutMillis: 500,
    });
    try {
        const res = await pool.query(text, params);
        return res;
    } finally {
        await pool.end();
    }
}

// Helper function for admin login
async function loginAsAdmin(page: Page) {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('[data-testid="email-input"]', 'admin@schoolsis.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
}

// Valid deterministic UUIDs for test isolation
const TEMP_STUDENT_ID = '8c91adf6-a010-414b-bfb6-b09e010414b5';
const TEMP_ISSUE_ID_1 = '8c91adf6-a010-414b-bfb6-b09e010414b6';
const TEMP_ISSUE_ID_2 = '8c91adf6-a010-414b-bfb6-b09e010414b7';
const TEMP_ISSUE_ID_3 = '8c91adf6-a010-414b-bfb6-b09e010414b8';

test.describe('Library Module Core E2E Tests', () => {

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
        // Reset library state in DB to ensure test isolation
        await runQuery("DELETE FROM invoices WHERE description = 'Library Fine - Overdue Book'");
        await runQuery("DELETE FROM book_issues WHERE book_id = 'd5b5c928-867c-473d-88f5-1bdf3a4bc071'");
        await runQuery("DELETE FROM students WHERE id = $1", [TEMP_STUDENT_ID]);
        await runQuery("UPDATE books SET available_copies = total_copies");
    });

    test('E2E-LB-101: View Books Catalog table', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library');

        await expect(page.locator('h1:has-text("Library Management")')).toBeVisible();
        
        // Verify catalog table shows the books
        await expect(page.locator('table')).toBeVisible();
        await expect(page.locator('table tbody tr:has-text("The Hobbit")')).toBeVisible();
        await expect(page.locator('table tbody tr:has-text("Introduction to Algorithms")')).toBeVisible();
    });

    test('E2E-LB-102: Switch Library Issue/Return Modes', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        // Initially we should see "Issue New Book" card
        await expect(page.getByText('Issue New Book').first()).toBeVisible();

        // Switch to Return mode
        await page.click('[data-testid="mode-return"]');
        await expect(page.getByText('Currently Issued Books').first()).toBeVisible();

        // Switch back to Issue mode
        await page.click('[data-testid="mode-issue"]');
        await expect(page.getByText('Issue New Book').first()).toBeVisible();
    });

    test('E2E-LB-103: Catalog Search Filtering', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        const select = page.locator('[data-testid="book-select"]');
        // Wait for books to load
        await select.locator('option:has-text("The Hobbit")').waitFor({ state: 'attached' });

        // Type "Hobbit" into the book search box
        await page.fill('[data-testid="book-search-input"]', 'Hobbit');

        // The select options should contain "The Hobbit" and not "Introduction to Algorithms"
        const html = await select.innerHTML();
        expect(html).toContain('The Hobbit');
        expect(html).not.toContain('Introduction to Algorithms');
    });

    test('E2E-LB-104: Issue Book Form Submission', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        // Wait for dropdowns to populate
        const studentSelect = page.locator('[data-testid="student-select"]');
        await studentSelect.locator('option:has-text("Aarav")').waitFor({ state: 'attached' });

        const bookSelect = page.locator('[data-testid="book-select"]');
        await bookSelect.locator('option:has-text("The Hobbit")').waitFor({ state: 'attached' });

        // Find values
        const studentValue = await studentSelect.locator('option:has-text("Aarav")').getAttribute('value');
        const bookValue = await bookSelect.locator('option:has-text("The Hobbit")').getAttribute('value');

        // Select the book and student
        await bookSelect.selectOption(bookValue!);
        await studentSelect.selectOption(studentValue!);

        // Issue book
        await page.click('[data-testid="issue-submit-btn"]');

        const banner = page.locator('[data-testid="message-banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('successfully issued');
    });

    test('E2E-LB-105: Return Book Form Submission', async ({ page }) => {
        // Seed a borrow record
        const studentRes = await runQuery("SELECT id, tenant_id FROM students LIMIT 1");
        const studentId = studentRes.rows[0].id;
        const tenantId = studentRes.rows[0].tenant_id;
        const bookRes = await runQuery("SELECT id FROM books WHERE title = 'The Hobbit' LIMIT 1");
        const bookId = bookRes.rows[0].id;
        const userRes = await runQuery("SELECT id FROM users WHERE tenant_id = $1 LIMIT 1", [tenantId]);
        const userId = userRes.rows[0].id;

        const todayStr = new Date().toISOString().split('T')[0];

        // Decrement copies
        await runQuery("UPDATE books SET available_copies = available_copies - 1 WHERE id = $1", [bookId]);

        // Insert issue record
        await runQuery(
            `INSERT INTO book_issues (id, tenant_id, book_id, issued_to_user_id, issued_to_student_id, issue_date, due_date, status, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ISSUED', 'E2E Test')`,
            [TEMP_ISSUE_ID_1, tenantId, bookId, userId, studentId, todayStr, todayStr]
        );

        await loginAsAdmin(page);
        await page.goto('/library/issue');

        await page.click('[data-testid="mode-return"]');

        const row = page.locator(`tr:has-text("The Hobbit")`);
        await expect(row).toBeVisible();
        await row.locator('button:has-text("Return")').click();

        const banner = page.locator('[data-testid="message-banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('returned successfully');
    });

    test('E2E-LB-201: Issue book validator blocks empty book select', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        // Wait for dropdown to populate
        const studentSelect = page.locator('[data-testid="student-select"]');
        await studentSelect.locator('option:has-text("Aarav")').waitFor({ state: 'attached' });

        // Select student only
        const studentValue = await studentSelect.locator('option:has-text("Aarav")').getAttribute('value');
        await studentSelect.selectOption(studentValue!);

        // Submit
        await page.click('[data-testid="issue-submit-btn"]');

        const banner = page.locator('[data-testid="message-banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('Please select both book and student');
    });

    test('E2E-LB-202: Issue book validator blocks empty student select', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        // Wait for dropdown to populate
        const bookSelect = page.locator('[data-testid="book-select"]');
        await bookSelect.locator('option:has-text("The Hobbit")').waitFor({ state: 'attached' });

        // Select book only
        const bookValue = await bookSelect.locator('option:has-text("The Hobbit")').getAttribute('value');
        await bookSelect.selectOption(bookValue!);

        // Submit
        await page.click('[data-testid="issue-submit-btn"]');

        const banner = page.locator('[data-testid="message-banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('Please select both book and student');
    });

    test('E2E-LB-203: Search box keyword returns no matching catalog titles', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/issue');

        // Type a non-matching query
        await page.fill('[data-testid="book-search-input"]', 'NonMatchingBookQueryXYZ');
        const select = page.locator('[data-testid="book-select"]');
        await expect(select).toBeVisible();

        // Dropdown lists only placeholder option
        const options = select.locator('option');
        await expect(options).toHaveCount(1);
        await expect(options.first()).toHaveAttribute('value', '');
        await expect(options.first()).toContainText('Select a book...');
    });

    test('E2E-LB-204: Issue book validator blocks student with missing user account', async ({ page }) => {
        const studentRes = await runQuery("SELECT tenant_id, grade_id, section_id FROM students LIMIT 1");
        const { tenant_id, grade_id, section_id } = studentRes.rows[0];

        const admissionNo = 'E2E-NOUSER-99';

        // Provide date_of_birth and admission_date to satisfy not-null constraints
        await runQuery(
            `INSERT INTO students (id, tenant_id, admission_number, first_name, last_name, gender, date_of_birth, admission_date, grade_id, section_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')`,
            [TEMP_STUDENT_ID, tenant_id, admissionNo, 'NoUser', 'Student', 'FEMALE', '2015-05-15', '2025-04-01', grade_id, section_id]
        );

        await loginAsAdmin(page);
        await page.goto('/library/issue');

        const bookSelect = page.locator('[data-testid="book-select"]');
        await bookSelect.locator('option:has-text("Introduction to Algorithms")').waitFor({ state: 'attached' });
        const bookValue = await bookSelect.locator('option:has-text("Introduction to Algorithms")').getAttribute('value');
        await bookSelect.selectOption(bookValue!);

        const studentSelect = page.locator('[data-testid="student-select"]');
        await studentSelect.locator(`option[value="${TEMP_STUDENT_ID}"]`).waitFor({ state: 'attached' });
        await studentSelect.selectOption(TEMP_STUDENT_ID);

        await page.click('[data-testid="issue-submit-btn"]');

        const banner = page.locator('[data-testid="message-banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('No user account found for selected student or their primary guardian');
    });

    test('E2E-LB-205: Borrowing history filters search with zero matches', async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/library/history');

        // Type a non-matching query in history page search
        await page.fill('input[placeholder="Search title or student..."]', 'NoMatchHere123xyz');
        await page.click('button:has-text("Search")');

        await expect(page.locator('table')).toContainText('No borrowing records found.');
    });

    test('E2E-COM-304: Library Overdue return triggers unpaid fine addition', async ({ page }) => {
        const studentRes = await runQuery("SELECT id, tenant_id FROM students LIMIT 1");
        const studentId = studentRes.rows[0].id;
        const tenantId = studentRes.rows[0].tenant_id;
        const bookRes = await runQuery("SELECT id FROM books WHERE title = 'The Hobbit' LIMIT 1");
        const bookId = bookRes.rows[0].id;
        const userRes = await runQuery("SELECT id FROM users WHERE tenant_id = $1 LIMIT 1", [tenantId]);
        const userId = userRes.rows[0].id;

        const today = new Date();
        
        const issueDate = new Date();
        issueDate.setDate(today.getDate() - 19);
        const issueDateStr = issueDate.toISOString().split('T')[0];

        const dueDate = new Date();
        dueDate.setDate(today.getDate() - 5);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Decrement copies
        await runQuery("UPDATE books SET available_copies = available_copies - 1 WHERE id = $1", [bookId]);

        // Insert overdue book issue (due 5 days ago)
        await runQuery(
            `INSERT INTO book_issues (id, tenant_id, book_id, issued_to_user_id, issued_to_student_id, issue_date, due_date, status, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ISSUED', 'E2E Test')`,
            [TEMP_ISSUE_ID_2, tenantId, bookId, userId, studentId, issueDateStr, dueDateStr]
        );

        await loginAsAdmin(page);
        await page.goto('/library/issue');

        await page.click('[data-testid="mode-return"]');

        const row = page.locator(`tr:has-text("The Hobbit")`);
        await expect(row).toBeVisible();
        await row.locator('button:has-text("Return")').click();

        const banner = page.locator('[data-testid="message-banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('returned successfully');

        // Check that the fine was added as an invoice
        // Overdue is 5 days, so 5 days * 5 Rs = 25 Rs
        const invoiceRes = await runQuery(
            `SELECT total_amount FROM invoices WHERE student_id = $1 AND description = 'Library Fine - Overdue Book' ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        expect(invoiceRes.rows.length).toBe(1);
        expect(parseFloat(invoiceRes.rows[0].total_amount)).toBe(25);
    });

    test('E2E-WRK-403: Monthly Library Overdue Audit & Fine Recovery loop', async ({ page }) => {
        const studentRes = await runQuery("SELECT id, tenant_id FROM students LIMIT 1");
        const studentId = studentRes.rows[0].id;
        const tenantId = studentRes.rows[0].tenant_id;
        const bookRes = await runQuery("SELECT id FROM books WHERE title = 'The Hobbit' LIMIT 1");
        const bookId = bookRes.rows[0].id;
        const userRes = await runQuery("SELECT id FROM users WHERE tenant_id = $1 LIMIT 1", [tenantId]);
        const userId = userRes.rows[0].id;

        const today = new Date();

        const issueDate = new Date();
        issueDate.setDate(today.getDate() - 19);
        const issueDateStr = issueDate.toISOString().split('T')[0];

        const dueDate = new Date();
        dueDate.setDate(today.getDate() - 5);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Force copies available to 2 (so we can assert it increments to 3)
        await runQuery("UPDATE books SET available_copies = 2 WHERE id = $1", [bookId]);

        await runQuery(
            `INSERT INTO book_issues (id, tenant_id, book_id, issued_to_user_id, issued_to_student_id, issue_date, due_date, status, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ISSUED', 'E2E Test')`,
            [TEMP_ISSUE_ID_3, tenantId, bookId, userId, studentId, issueDateStr, dueDateStr]
        );

        await loginAsAdmin(page);

        // 1. Audit overdue borrow logs
        await page.goto('/library/history?filter=OVERDUE');
        await expect(page.locator(`tr:has-text("The Hobbit")`)).toBeVisible();

        // 2. Return overdue book
        await page.goto('/library/issue');
        await page.click('[data-testid="mode-return"]');

        const row = page.locator(`tr:has-text("The Hobbit")`);
        await expect(row).toBeVisible();
        await row.locator('button:has-text("Return")').click();

        const banner = page.locator('[data-testid="message-banner"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('returned successfully');

        // 3. Verify book copy available increments
        const bookCheck = await runQuery("SELECT available_copies FROM books WHERE id = $1", [bookId]);
        expect(bookCheck.rows[0].available_copies).toBe(3);

        // 4. Assert outstanding fines update
        const invoiceRes = await runQuery(
            `SELECT total_amount FROM invoices WHERE student_id = $1 AND description = 'Library Fine - Overdue Book' ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        expect(invoiceRes.rows.length).toBe(1);
        expect(parseFloat(invoiceRes.rows[0].total_amount)).toBe(25);

        // Verify unpaid fines card displays
        await page.goto('/library/history');
        const unpaidFinesCard = page.locator('div.text-sm:has-text("Unpaid Fines")').locator('xpath=..');
        await expect(unpaidFinesCard).toBeVisible();
        const textContent = await unpaidFinesCard.textContent();
        expect(textContent).toContain('₹');
    });

});
