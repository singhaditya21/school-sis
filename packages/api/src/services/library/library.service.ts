'use server';

import { pool } from '@/lib/db';
import { tenantScope, eq, desc, sql, identifier } from '../../data';
import { requireAuth } from '@/lib/auth/middleware';
import { books, bookIssues, students, users } from '../../db/generated/tables';

function validateISBN(isbn: string): boolean {
    const clean = isbn.replace(/[-\s]/g, '').toUpperCase();
    if (clean.length === 10) {
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            const digit = parseInt(clean[i], 10);
            if (isNaN(digit)) return false;
            sum += (10 - i) * digit;
        }
        const last = clean[9];
        if (last === 'X') {
            sum += 10;
        } else {
            const digit = parseInt(last, 10);
            if (isNaN(digit)) return false;
            sum += digit;
        }
        return sum % 11 === 0;
    } else if (clean.length === 13) {
        let sum = 0;
        for (let i = 0; i < 13; i++) {
            const digit = parseInt(clean[i], 10);
            if (isNaN(digit)) return false;
            sum += (i % 2 === 0 ? 1 : 3) * digit;
        }
        return sum % 10 === 0;
    }
    return false;
}

/**
 * Fetch students for library auto-complete/select dropdown.
 * Checks permissions using 'library:read'.
 */
export async function getLibraryStudents(): Promise<any[]> {
    const { tenantId } = await requireAuth('library:read');
    const { rows } = await pool.query(`
        SELECT s.id,
               COALESCE(s.user_id, (SELECT user_id FROM guardians WHERE student_id = s.id AND is_primary = true LIMIT 1)) AS "userId",
               s.admission_number AS "admissionNo",
               s.first_name||' '||s.last_name AS name,
               g.name||'-'||sec.name AS class
        FROM students s
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
        ORDER BY s.first_name
        LIMIT 100
    `, [tenantId]);
    return rows;
}

/**
 * Fetch all library borrowing history for the current tenant.
 * Checks permissions using 'library:read'.
 */
export async function getLibraryHistory(): Promise<any[]> {
    const { tenantId } = await requireAuth('library:read');
    const { rows } = await pool.query(`
        SELECT
            bi.id,
            bi.book_id AS "bookId",
            b.title AS "bookTitle",
            bi.issued_to_student_id AS "studentId",
            s.first_name AS "studentName",
            s.last_name AS "studentLastName",
            g.name||'-'||sec.name AS "studentClass",
            u.first_name AS "userName",
            u.last_name AS "userLastName",
            bi.issue_date AS "issueDate",
            bi.due_date AS "dueDate",
            bi.return_date AS "returnDate",
            bi.status,
            bi.fine_amount AS "fineAmount",
            bi.is_fine_paid AS "finePaid"
        FROM book_issues bi
        LEFT JOIN books b ON bi.book_id = b.id
        LEFT JOIN students s ON bi.issued_to_student_id = s.id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        LEFT JOIN users u ON bi.issued_to_user_id = u.id
        WHERE bi.tenant_id = $1
        ORDER BY bi.issue_date DESC
    `, [tenantId]);
    return rows.map(r => ({
        ...r,
        issueDate: r.issueDate instanceof Date ? r.issueDate.toISOString().split('T')[0] : r.issueDate,
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : r.dueDate,
        returnDate: r.returnDate instanceof Date ? r.returnDate.toISOString().split('T')[0] : r.returnDate,
    }));
}

export async function getBooks(tenantId: string) {
    return await tenantScope(tenantId)
        .from(books)
        .select<{
            id: string; title: string; author: string | null; isbn: string | null; publisher: string | null;
            category: string; subject: string | null; totalCopies: number; availableCopies: number;
            location: string | null; isActive: boolean;
        }>({
            id: books.id, title: books.title, author: books.author, isbn: books.isbn, publisher: books.publisher,
            category: books.category, subject: books.subject, totalCopies: books.totalCopies,
            availableCopies: books.availableCopies, location: books.location, isActive: books.isActive,
        })
        .rows();
}

export async function getBorrowHistory(tenantId: string) {
    const list = await tenantScope(tenantId)
        .from(bookIssues)
        .leftJoin(books, eq(bookIssues.bookId, books.id))
        .leftJoin(students, eq(bookIssues.issuedToStudentId, students.id))
        .select<{
            id: string; bookId: string; bookTitle: string | null; studentId: string | null; studentName: string | null;
            issueDate: Date | string | null; dueDate: Date | string | null; returnDate: Date | string | null;
            status: string; fineAmount: string | null; finePaid: boolean;
        }>({
            id: bookIssues.id,
            bookId: bookIssues.bookId,
            bookTitle: books.title,
            studentId: bookIssues.issuedToStudentId,
            studentName: sql`${students.firstName} || ' ' || ${students.lastName}`,
            issueDate: bookIssues.issueDate,
            dueDate: bookIssues.dueDate,
            returnDate: bookIssues.returnDate,
            status: bookIssues.status,
            fineAmount: bookIssues.fineAmount,
            finePaid: bookIssues.isFinePaid,
        })
        .orderBy(desc(bookIssues.issueDate))
        .rows();

    return list.map(r => ({
        ...r,
        issueDate: r.issueDate instanceof Date ? r.issueDate.toISOString().split('T')[0] : r.issueDate,
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : r.dueDate,
        returnDate: r.returnDate instanceof Date ? r.returnDate.toISOString().split('T')[0] : r.returnDate,
    }));
}

export async function issueBook(tenantId: string, data: { bookId: string; studentId: string; isbnOrBarcode?: string }) {
    const scope = tenantScope(tenantId);
    let finalBookId = data.bookId;

    if (data.isbnOrBarcode) {
        const isValid = validateISBN(data.isbnOrBarcode);
        if (!isValid) {
            throw new Error('Invalid ISBN-10 or ISBN-13 checksum format');
        }

        const cleanIsbn = data.isbnOrBarcode.replace(/[-\s]/g, '').toUpperCase();
        const foundBooks = await scope
            .from(books)
            .select<{ id: string }>({ id: books.id })
            .where(sql`upper(replace(replace(${books.isbn}, '-', ''), ' ', '')) = ${cleanIsbn}`)
            .limit(1)
            .rows();

        if (foundBooks.length === 0) {
            throw new Error('Book with the specified ISBN not found');
        }
        finalBookId = foundBooks[0].id;
    }

    const book = await scope
        .from(books)
        .select<{ id: string; availableCopies: number }>({ id: books.id, availableCopies: books.availableCopies })
        .where(eq(books.id, finalBookId))
        .first();

    if (!book) {
        throw new Error('Book not found');
    }
    if (book.availableCopies <= 0) {
        throw new Error('No available copies of this book');
    }

    const issueDateStr = new Date().toISOString().split('T')[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const student = await scope
        .from(students)
        .select<{ id: string; userId: string | null }>({ id: students.id, userId: students.userId })
        .where(eq(students.id, data.studentId))
        .first();

    if (!student) {
        throw new Error('Student not found');
    }

    let issuedToUserId = student.userId;
    if (!issuedToUserId) {
        const firstUser = await scope.from(users).select<{ id: string }>({ id: users.id }).first();
        if (firstUser) {
            issuedToUserId = firstUser.id;
        } else {
            throw new Error('No valid user found to issue the book to');
        }
    }

    // tenant_id is set explicitly; RLS on the routing pool still enforces the tenant.
    const [issue] = await sql`
        INSERT INTO ${identifier(bookIssues.$name)}
            (tenant_id, book_id, issued_to_user_id, issued_to_student_id, issue_date, due_date, status)
        VALUES (${tenantId}, ${finalBookId}, ${issuedToUserId}, ${data.studentId}, ${issueDateStr}, ${dueDateStr}, 'ISSUED')
        RETURNING *
    `;

    await scope.update(
        books,
        { availableCopies: book.availableCopies - 1, updatedAt: new Date() },
        eq(books.id, finalBookId),
    );

    return issue;
}
