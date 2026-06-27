'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

// ─── Book Catalogue ──────────────────────────────────────────

export async function getBooks(categoryFilter?: string) {
    const { tenantId } = await requireAuth('library:read');

    let query = `
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
        WHERE tenant_id = $1 AND is_active = true
    `;
    const params: any[] = [tenantId];

    if (categoryFilter && categoryFilter !== 'ALL') {
        params.push(categoryFilter);
        query += ` AND category = $2`;
    }

    query += ` ORDER BY title ASC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

export async function addBook(formData: FormData) {
    const { tenantId } = await requireAuth('library:write');

    const title = formData.get('title') as string;
    const author = formData.get('author') as string;
    const isbn = formData.get('isbn') as string || null;
    const publisher = formData.get('publisher') as string || null;
    const edition = formData.get('edition') as string || null;
    const year = formData.get('year') ? parseInt(formData.get('year') as string) : null;
    const category = formData.get('category') as string || 'TEXTBOOK';
    const location = formData.get('location') as string || null;
    const totalCopies = parseInt(formData.get('totalCopies') as string || '1');

    if (!title || !author) {
        return { success: false, error: 'Title and Author are required' };
    }

    await pool.query(
        `INSERT INTO books (
            id, tenant_id, title, author, isbn, publisher, edition, year, category, location, total_copies, available_copies
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`,
        [randomUUID(), tenantId, title, author, isbn, publisher, edition, year, category, location, totalCopies, totalCopies]
    );

    return { success: true };
}

// ─── Library Stats ───────────────────────────────────────────

export async function getLibraryStats() {
    const { tenantId } = await requireAuth('library:read');

    const bookCountRes = await pool.query(`
        SELECT 
            COUNT(*)::int AS count, 
            SUM(total_copies)::text AS "totalCopies", 
            SUM(available_copies)::text AS "availableCopies" 
        FROM books 
        WHERE tenant_id = $1 AND is_active = true
    `, [tenantId]);
    const bookCount = bookCountRes.rows[0];

    const today = new Date().toISOString().split('T')[0];
    
    const overdueRes = await pool.query(`
        SELECT COUNT(*)::int AS count 
        FROM book_issues 
        WHERE tenant_id = $1 AND status = 'ISSUED' AND due_date < $2
    `, [tenantId, today]);
    
    const issuedTodayRes = await pool.query(`
        SELECT COUNT(*)::int AS count 
        FROM book_issues 
        WHERE tenant_id = $1 AND issue_date = $2
    `, [tenantId, today]);

    const finesRes = await pool.query(`
        SELECT COALESCE(SUM(fine_amount::numeric), 0)::text AS total 
        FROM book_issues 
        WHERE tenant_id = $1 AND is_fine_paid = false AND fine_amount != '0'
    `, [tenantId]);

    return {
        totalBooks: bookCount.count,
        totalCopies: Number(bookCount.totalCopies || 0),
        availableCopies: Number(bookCount.availableCopies || 0),
        overdueBooks: overdueRes.rows[0].count,
        issuedToday: issuedTodayRes.rows[0].count,
        totalFinesPending: Number(finesRes.rows[0]?.total || 0),
    };
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

    // Check availability
    const bookRes = await pool.query(
        `SELECT available_copies AS "availableCopies" FROM books WHERE id = $1 AND tenant_id = $2`,
        [data.bookId, tenantId]
    );
    const book = bookRes.rows[0];

    if (!book || book.availableCopies <= 0) {
        return { success: false, error: 'No copies available' };
    }

    // Create issue record
    await pool.query(
        `INSERT INTO book_issues (
            id, tenant_id, book_id, issued_to_user_id, issued_to_student_id, issue_date, due_date, issued_by, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            randomUUID(),
            tenantId,
            data.bookId,
            data.issuedToUserId,
            data.issuedToStudentId || null,
            new Date().toISOString().split('T')[0],
            data.dueDate,
            userId,
            data.remarks || null
        ]
    );

    // Decrement available copies
    await pool.query(
        `UPDATE books SET available_copies = available_copies - 1 WHERE id = $1`,
        [data.bookId]
    );

    return { success: true };
}

export async function returnBook(issueId: string, fineAmount?: number) {
    const { tenantId, userId } = await requireAuth('library:write');

    const issueRes = await pool.query(
        `SELECT book_id AS "bookId", status FROM book_issues WHERE id = $1 AND tenant_id = $2`,
        [issueId, tenantId]
    );
    const issue = issueRes.rows[0];

    if (!issue || issue.status !== 'ISSUED') {
        return { success: false, error: 'Invalid issue or already returned' };
    }

    // Mark as returned
    await pool.query(
        `UPDATE book_issues 
         SET status = 'RETURNED', 
             return_date = $1, 
             returned_to = $2, 
             fine_amount = $3 
         WHERE id = $4`,
        [
            new Date().toISOString().split('T')[0],
            userId,
            fineAmount ? String(fineAmount) : '0',
            issueId
        ]
    );

    // Increment available copies
    await pool.query(
        `UPDATE books SET available_copies = available_copies + 1 WHERE id = $1`,
        [issue.bookId]
    );

    return { success: true };
}

export async function getOverdueList() {
    const { tenantId } = await requireAuth('library:read');
    const today = new Date().toISOString().split('T')[0];

    const { rows } = await pool.query(`
        SELECT 
            bi.id,
            b.title AS "bookTitle",
            b.author AS "bookAuthor",
            u.first_name AS "borrowerFirstName",
            u.last_name AS "borrowerLastName",
            bi.issue_date AS "issueDate",
            bi.due_date AS "dueDate",
            bi.fine_amount AS "fineAmount"
        FROM book_issues bi
        INNER JOIN books b ON bi.book_id = b.id
        INNER JOIN users u ON bi.issued_to_user_id = u.id
        WHERE bi.tenant_id = $1 AND bi.status = 'ISSUED' AND bi.due_date < $2
        ORDER BY bi.due_date ASC
    `, [tenantId, today]);

    return rows;
}
