'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import { calculateOverdueFine } from '@/app/(admin)/library/fine-policy';

// ─── Book Catalogue ──────────────────────────────────────────

export async function getBooks(categoryFilter?: string) {
    const { tenantId } = await requireAuth('library:read');
    const categoryClause =
        categoryFilter && categoryFilter !== 'ALL'
            ? sql`AND category = ${categoryFilter}`
            : sql``;

    return sql`
        SELECT 
            id,
            title,
            author,
            isbn,
            publisher,
            edition,
            year,
            category,
            location,
            total_copies AS "totalCopies",
            available_copies AS "availableCopies"
        FROM books
        WHERE tenant_id = ${tenantId} AND is_active = true
          ${categoryClause}
        ORDER BY title ASC
    `;
}

// ─── Issue / Return ──────────────────────────────────────────

export async function issueBook(data: {
    bookId: string;
    issuedToUserId: string;
    issuedToStudentId?: string;
    dueDate: string;
    remarks?: string;
}) {
    const { tenantId, userId } = await requireAuth('library:write');

    const book = await sql<{ availableCopies: number }>`
        SELECT available_copies AS "availableCopies"
        FROM books
        WHERE id = ${data.bookId} AND tenant_id = ${tenantId}
    `.maybeOne();

    if (!book || book.availableCopies <= 0) {
        return { success: false, error: 'No copies available' };
    }

    const issueId = randomUUID();
    const issueDate = new Date().toISOString().split('T')[0];

    await sql`
        INSERT INTO book_issues (
            id, tenant_id, book_id, issued_to_user_id, issued_to_student_id, issue_date, due_date, issued_by, remarks
        ) VALUES (
            ${issueId},
            ${tenantId},
            ${data.bookId},
            ${data.issuedToUserId},
            ${data.issuedToStudentId || null},
            ${issueDate},
            ${data.dueDate},
            ${userId},
            ${data.remarks || null}
        )
    `.execute();

    await sql`
        UPDATE books
        SET available_copies = available_copies - 1
        WHERE id = ${data.bookId}
    `.execute();

    return { success: true };
}

export async function returnBook(issueId: string, fineAmount?: number) {
    const { tenantId, userId } = await requireAuth('library:write');

    const issue = await sql<{
        bookId: string;
        status: string;
        dueDate: Date | string;
        studentId: string | null;
    }>`
        SELECT book_id AS "bookId", status, due_date AS "dueDate", issued_to_student_id AS "studentId"
        FROM book_issues
        WHERE id = ${issueId} AND tenant_id = ${tenantId}
    `.maybeOne();

    if (!issue || issue.status !== 'ISSUED') {
        return { success: false, error: 'Invalid issue or already returned' };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // An explicitly supplied fine (e.g. a damage charge) wins; otherwise bill the
    // published overdue rate — the same constant the issue screen quotes to staff.
    const finalFine = fineAmount || calculateOverdueFine(issue.dueDate, today);

    await sql`
        UPDATE book_issues 
        SET status = 'RETURNED', 
            return_date = ${todayStr}, 
            returned_to = ${userId}, 
            fine_amount = ${String(finalFine)} 
        WHERE id = ${issueId}
    `.execute();

    await sql`
        UPDATE books
        SET available_copies = available_copies + 1
        WHERE id = ${issue.bookId}
    `.execute();

    if (finalFine > 0 && issue.studentId) {
        const feePlan = await sql<{ id: string }>`
            SELECT id FROM fee_plans WHERE tenant_id = ${tenantId} LIMIT 1
        `.maybeOne();

        if (feePlan?.id) {
            const invoiceNo = `INV-LI-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
            await sql`
                INSERT INTO invoices (tenant_id, student_id, fee_plan_id, invoice_number, total_amount, paid_amount, due_date, status, description)
                VALUES (${tenantId}, ${issue.studentId}, ${feePlan.id}, ${invoiceNo}, ${String(finalFine)}, '0', ${todayStr}, 'PENDING', ${'Library Fine - Overdue Book'})
            `.execute();
        }
    }

    return { success: true };
}
