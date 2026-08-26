'use server';

/**
 * Library workspace actions (colocated with the /library route).
 *
 * Backed by the real `books` and `book_issues` tables. Every statement is
 * tenant-scoped and parameterised; `stops`-style child tables do not apply here
 * because both tables carry their own tenant_id.
 *
 * The overdue fine rate is NOT duplicated here — it is imported from
 * ./fine-policy and passed into SQL as a bind parameter so the catalogue,
 * the issue desk and the borrowing history all quote the same number.
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';

import {
    BOOK_CATEGORIES_LIST,
    HISTORY_STATUS_LIST,
    type BorrowingRecordView,
    type BorrowingSummaryView,
    type CatalogueBookView,
    type CatalogueStatsView,
} from './catalogue-constants';
import { LIBRARY_FINE_PER_DAY } from './fine-policy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BookInput {
    title: string;
    author: string;
    isbn?: string;
    publisher?: string;
    edition?: string;
    year?: string;
    category?: string;
    subject?: string;
    language?: string;
    location?: string;
    price?: string;
    description?: string;
    totalCopies?: string;
}

export interface BorrowingFilters {
    status?: string;
    q?: string;
    from?: string;
    to?: string;
}

// ─── helpers ─────────────────────────────────────────────────

function trimmed(value: string | undefined | null): string | null {
    if (value === undefined || value === null) return null;
    const t = String(value).trim();
    return t === '' ? null : t;
}

function parseIntOrNull(value: string | undefined): number | null {
    const t = trimmed(value);
    if (t === null) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
}

/** Only accept a decimal money string; anything else becomes null so numeric(10,2) never blows up at runtime. */
function parseMoneyOrNull(value: string | undefined): string | null {
    const t = trimmed(value);
    if (t === null) return null;
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(t)) return null;
    return t;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normaliseDate(value: string | Date | null): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString().split('T')[0];
    const s = String(value);
    return s.includes('T') ? s.split('T')[0] : s;
}

interface BookValidation {
    ok: boolean;
    error?: string;
}

function validateBookInput(input: BookInput, isUpdate: boolean): BookValidation {
    const title = trimmed(input.title);
    const author = trimmed(input.author);

    if (!title) return { ok: false, error: 'Title is required.' };
    if (!author) return { ok: false, error: 'Author is required.' };
    if (title.length > 500) return { ok: false, error: 'Title must be 500 characters or fewer.' };
    if (author.length > 255) return { ok: false, error: 'Author must be 255 characters or fewer.' };

    const isbn = trimmed(input.isbn);
    if (isbn && isbn.length > 20) return { ok: false, error: 'ISBN must be 20 characters or fewer.' };

    const category = trimmed(input.category);
    if (category && !(BOOK_CATEGORIES_LIST as readonly string[]).includes(category)) {
        return { ok: false, error: 'Unknown category.' };
    }

    const year = parseIntOrNull(input.year);
    if (input.year && trimmed(input.year) !== null && year === null) {
        return { ok: false, error: 'Year must be a whole number.' };
    }
    if (year !== null && (year < 1400 || year > new Date().getFullYear() + 1)) {
        return { ok: false, error: 'Year looks wrong — use a four digit publication year.' };
    }

    const copies = parseIntOrNull(input.totalCopies);
    if (!isUpdate || trimmed(input.totalCopies) !== null) {
        if (copies === null || copies < 1) return { ok: false, error: 'Total copies must be at least 1.' };
        if (copies > 10000) return { ok: false, error: 'Total copies must be 10,000 or fewer.' };
    }

    if (trimmed(input.price) !== null && parseMoneyOrNull(input.price) === null) {
        return { ok: false, error: 'Price must be a number with at most two decimal places.' };
    }

    return { ok: true };
}

// ─── Catalogue ───────────────────────────────────────────────

export async function listCatalogue(filters: {
    category?: string;
    q?: string;
    includeArchived?: boolean;
} = {}): Promise<CatalogueBookView[]> {
    const { tenantId } = await requireAuth('library:read');

    const params: unknown[] = [tenantId];
    const where: string[] = ['b.tenant_id = $1'];

    if (!filters.includeArchived) {
        where.push('b.is_active = true');
    }

    const category = trimmed(filters.category);
    if (category && category !== 'ALL') {
        if (!(BOOK_CATEGORIES_LIST as readonly string[]).includes(category)) {
            return [];
        }
        params.push(category);
        where.push(`b.category = $${params.length}::book_category`);
    }

    const q = trimmed(filters.q);
    if (q) {
        params.push(`%${q}%`);
        const idx = params.length;
        where.push(
            `(b.title ILIKE $${idx} OR b.author ILIKE $${idx} OR COALESCE(b.isbn, '') ILIKE $${idx} OR COALESCE(b.publisher, '') ILIKE $${idx} OR COALESCE(b.subject, '') ILIKE $${idx})`,
        );
    }

    const { rows } = await pool.query(
        `SELECT b.id,
                b.title,
                b.author,
                b.isbn,
                b.publisher,
                b.edition,
                b.year,
                b.category::text AS category,
                b.subject,
                b.language,
                b.location,
                b.price,
                b.description,
                b.total_copies AS "totalCopies",
                b.available_copies AS "availableCopies",
                b.is_active AS "isActive",
                (SELECT COUNT(*)::int
                   FROM book_issues bi
                  WHERE bi.book_id = b.id
                    AND bi.tenant_id = b.tenant_id
                    AND bi.status IN ('ISSUED', 'OVERDUE')) AS "onLoan"
           FROM books b
          WHERE ${where.join(' AND ')}
          ORDER BY b.title ASC`,
        params,
    );

    return rows as CatalogueBookView[];
}

export async function createBook(input: BookInput): Promise<{ success: boolean; error?: string; id?: string }> {
    const { tenantId } = await requireAuth('library:write');

    const validation = validateBookInput(input, false);
    if (!validation.ok) return { success: false, error: validation.error };

    const totalCopies = parseIntOrNull(input.totalCopies) ?? 1;
    const id = randomUUID();

    await pool.query(
        `INSERT INTO books (
             id, tenant_id, title, author, isbn, publisher, edition, year,
             category, subject, language, location, price, description,
             total_copies, available_copies
         ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             COALESCE($9, 'TEXTBOOK')::book_category, $10, COALESCE($11, 'English'), $12, $13, $14,
             $15, $15
         )`,
        [
            id,
            tenantId,
            trimmed(input.title),
            trimmed(input.author),
            trimmed(input.isbn),
            trimmed(input.publisher),
            trimmed(input.edition),
            parseIntOrNull(input.year),
            trimmed(input.category),
            trimmed(input.subject),
            trimmed(input.language),
            trimmed(input.location),
            parseMoneyOrNull(input.price),
            trimmed(input.description),
            totalCopies,
        ],
    );

    revalidatePath('/library');
    return { success: true, id };
}

export async function updateBook(
    bookId: string,
    input: BookInput,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('library:write');

    if (!UUID_RE.test(bookId)) return { success: false, error: 'Invalid book reference.' };

    const validation = validateBookInput(input, true);
    if (!validation.ok) return { success: false, error: validation.error };

    const existingRes = await pool.query(
        `SELECT b.total_copies AS "totalCopies",
                b.available_copies AS "availableCopies",
                (SELECT COUNT(*)::int
                   FROM book_issues bi
                  WHERE bi.book_id = b.id
                    AND bi.tenant_id = b.tenant_id
                    AND bi.status IN ('ISSUED', 'OVERDUE')) AS "onLoan"
           FROM books b
          WHERE b.id = $1 AND b.tenant_id = $2`,
        [bookId, tenantId],
    );
    const existing = existingRes.rows[0];
    if (!existing) return { success: false, error: 'Book not found.' };

    const requestedTotal = parseIntOrNull(input.totalCopies);
    const totalCopies = requestedTotal ?? Number(existing.totalCopies);

    if (totalCopies < Number(existing.onLoan)) {
        return {
            success: false,
            error: `${existing.onLoan} cop${existing.onLoan === 1 ? 'y is' : 'ies are'} currently on loan — total copies cannot go below that.`,
        };
    }

    // Re-derive availability from the loan ledger rather than trusting the stored
    // counter, so a stock correction also repairs any historical drift.
    const availableCopies = totalCopies - Number(existing.onLoan);

    await pool.query(
        `UPDATE books
            SET title = $1,
                author = $2,
                isbn = $3,
                publisher = $4,
                edition = $5,
                year = $6,
                category = COALESCE($7, category::text)::book_category,
                subject = $8,
                language = COALESCE($9, language),
                location = $10,
                price = $11,
                description = $12,
                total_copies = $13,
                available_copies = $14,
                updated_at = now()
          WHERE id = $15 AND tenant_id = $16`,
        [
            trimmed(input.title),
            trimmed(input.author),
            trimmed(input.isbn),
            trimmed(input.publisher),
            trimmed(input.edition),
            parseIntOrNull(input.year),
            trimmed(input.category),
            trimmed(input.subject),
            trimmed(input.language),
            trimmed(input.location),
            parseMoneyOrNull(input.price),
            trimmed(input.description),
            totalCopies,
            availableCopies,
            bookId,
            tenantId,
        ],
    );

    revalidatePath('/library');
    return { success: true };
}

/**
 * Books are never hard-deleted — `book_issues` rows reference them and the
 * borrowing history has to stay readable. Archiving flips `is_active`, which is
 * the flag every other library read already filters on.
 */
export async function setBookArchived(
    bookId: string,
    archived: boolean,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('library:write');

    if (!UUID_RE.test(bookId)) return { success: false, error: 'Invalid book reference.' };

    if (archived) {
        const onLoanRes = await pool.query(
            `SELECT COUNT(*)::int AS count
               FROM book_issues
              WHERE book_id = $1 AND tenant_id = $2 AND status IN ('ISSUED', 'OVERDUE')`,
            [bookId, tenantId],
        );
        const onLoan = Number(onLoanRes.rows[0]?.count ?? 0);
        if (onLoan > 0) {
            return {
                success: false,
                error: `Cannot archive — ${onLoan} cop${onLoan === 1 ? 'y is' : 'ies are'} still out on loan.`,
            };
        }
    }

    // is_active is the inverse of "archived" — writing `archived` straight into the
    // column would silently do the opposite of what the button says.
    const { rowCount } = await pool.query(
        `UPDATE books SET is_active = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
        [!archived, bookId, tenantId],
    );

    if (!rowCount) return { success: false, error: 'Book not found.' };

    revalidatePath('/library');
    return { success: true };
}

// ─── Borrowing history ───────────────────────────────────────

/**
 * `status` is projected: a loan still marked ISSUED whose due date has passed
 * reads as OVERDUE. The same projection drives the fine so the table and the
 * summary cards can never disagree.
 */
const HISTORY_STATUS_SQL = `CASE
        WHEN bi.status = 'ISSUED' AND bi.due_date < CURRENT_DATE THEN 'OVERDUE'
        ELSE bi.status::text
    END`;

const HISTORY_FINE_SQL = `GREATEST(
        COALESCE(bi.fine_amount, 0)::numeric,
        CASE
            WHEN bi.status = 'ISSUED' AND bi.due_date < CURRENT_DATE
                THEN (CURRENT_DATE - bi.due_date) * $RATE::numeric
            WHEN bi.return_date IS NOT NULL AND bi.return_date > bi.due_date
                THEN (bi.return_date - bi.due_date) * $RATE::numeric
            ELSE 0
        END
    )`;

const HISTORY_FROM_SQL = `FROM book_issues bi
         LEFT JOIN books b ON b.id = bi.book_id
         LEFT JOIN students s ON s.id = bi.issued_to_student_id
         LEFT JOIN sections sec ON sec.id = s.section_id
         LEFT JOIN grades g ON g.id = sec.grade_id
         LEFT JOIN users u ON u.id = bi.issued_to_user_id`;

const BORROWER_NAME_SQL = `COALESCE(
        NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), ''),
        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
    )`;

export async function listBorrowingHistory(filters: BorrowingFilters = {}): Promise<BorrowingRecordView[]> {
    const { tenantId } = await requireAuth('library:read');

    const params: unknown[] = [tenantId, LIBRARY_FINE_PER_DAY];
    const rateParam = '$2';
    const where: string[] = ['bi.tenant_id = $1'];

    const status = trimmed(filters.status)?.toUpperCase();
    if (status && status !== 'ALL') {
        if (!(HISTORY_STATUS_LIST as readonly string[]).includes(status)) return [];
        params.push(status);
        where.push(`${HISTORY_STATUS_SQL} = $${params.length}`);
    }

    const q = trimmed(filters.q);
    if (q) {
        params.push(`%${q}%`);
        const idx = params.length;
        where.push(
            `(COALESCE(b.title, '') ILIKE $${idx} OR COALESCE(b.author, '') ILIKE $${idx} OR COALESCE(${BORROWER_NAME_SQL}, '') ILIKE $${idx})`,
        );
    }

    const from = trimmed(filters.from);
    if (from && ISO_DATE_RE.test(from)) {
        params.push(from);
        where.push(`bi.issue_date >= $${params.length}::date`);
    }

    const to = trimmed(filters.to);
    if (to && ISO_DATE_RE.test(to)) {
        params.push(to);
        where.push(`bi.issue_date <= $${params.length}::date`);
    }

    const { rows } = await pool.query(
        `SELECT bi.id,
                b.title AS "bookTitle",
                b.author AS "bookAuthor",
                bi.issued_to_student_id AS "studentId",
                ${BORROWER_NAME_SQL} AS "borrowerName",
                g.name || '-' || sec.name AS "borrowerClass",
                bi.issue_date AS "issueDate",
                bi.due_date AS "dueDate",
                bi.return_date AS "returnDate",
                ${HISTORY_STATUS_SQL} AS "status",
                ${HISTORY_FINE_SQL.replace(/\$RATE/g, rateParam)}::text AS "fineAmount",
                bi.is_fine_paid AS "finePaid"
         ${HISTORY_FROM_SQL}
         WHERE ${where.join(' AND ')}
         ORDER BY bi.issue_date DESC, bi.created_at DESC
         LIMIT 500`,
        params,
    );

    return rows.map((r) => ({
        id: r.id,
        bookTitle: r.bookTitle,
        bookAuthor: r.bookAuthor,
        studentId: r.studentId,
        borrowerName: r.borrowerName,
        borrowerClass: r.borrowerClass,
        issueDate: normaliseDate(r.issueDate) ?? '',
        dueDate: normaliseDate(r.dueDate) ?? '',
        returnDate: normaliseDate(r.returnDate),
        status: r.status,
        fineAmount: Number(r.fineAmount ?? 0),
        finePaid: Boolean(r.finePaid),
    }));
}

/** Summary cards always describe the whole tenant history, never the filtered slice. */
export async function getBorrowingSummary(): Promise<BorrowingSummaryView> {
    const { tenantId } = await requireAuth('library:read');

    const fine = HISTORY_FINE_SQL.replace(/\$RATE/g, '$2');

    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ${HISTORY_STATUS_SQL} = 'ISSUED')::int AS issued,
                COUNT(*) FILTER (WHERE ${HISTORY_STATUS_SQL} = 'OVERDUE')::int AS overdue,
                COUNT(*) FILTER (WHERE ${HISTORY_STATUS_SQL} = 'RETURNED')::int AS returned,
                COUNT(*) FILTER (WHERE ${HISTORY_STATUS_SQL} = 'LOST')::int AS lost,
                COALESCE(SUM(${fine}), 0)::text AS "totalFines",
                COALESCE(SUM(${fine}) FILTER (WHERE bi.is_fine_paid = false), 0)::text AS "unpaidFines"
         FROM book_issues bi
         WHERE bi.tenant_id = $1`,
        [tenantId, LIBRARY_FINE_PER_DAY],
    );

    const r = rows[0] ?? {};
    return {
        total: Number(r.total ?? 0),
        issued: Number(r.issued ?? 0),
        overdue: Number(r.overdue ?? 0),
        returned: Number(r.returned ?? 0),
        lost: Number(r.lost ?? 0),
        totalFines: Number(r.totalFines ?? 0),
        unpaidFines: Number(r.unpaidFines ?? 0),
    };
}

/**
 * Headline numbers for the catalogue screen.
 *
 * `finesPending` uses the SAME projection as getBorrowingSummary() — a book
 * still out past its due date has an unpaid fine accruing even though nothing
 * has been written to book_issues.fine_amount yet. Counting only the stored
 * column (as the older getLibraryStats() does) reported ₹0 pending while the
 * borrowing-history screen, on the same data, showed the real figure.
 */
export async function getCatalogueStats(): Promise<CatalogueStatsView> {
    const { tenantId } = await requireAuth('library:read');

    const booksRes = await pool.query(
        `SELECT COUNT(*)::int AS "totalTitles",
                COALESCE(SUM(total_copies), 0)::int AS "totalCopies",
                COALESCE(SUM(available_copies), 0)::int AS "availableCopies"
           FROM books
          WHERE tenant_id = $1 AND is_active = true`,
        [tenantId],
    );

    const issuesRes = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE bi.issue_date = CURRENT_DATE)::int AS "issuedToday",
                COUNT(*) FILTER (WHERE bi.status = 'ISSUED' AND bi.due_date < CURRENT_DATE)::int AS "overdueBooks",
                COALESCE(SUM(${HISTORY_FINE_SQL.replace(/\$RATE/g, '$2')}) FILTER (WHERE bi.is_fine_paid = false), 0)::text AS "finesPending"
           FROM book_issues bi
          WHERE bi.tenant_id = $1`,
        [tenantId, LIBRARY_FINE_PER_DAY],
    );

    const b = booksRes.rows[0] ?? {};
    const i = issuesRes.rows[0] ?? {};

    return {
        totalTitles: Number(b.totalTitles ?? 0),
        totalCopies: Number(b.totalCopies ?? 0),
        availableCopies: Number(b.availableCopies ?? 0),
        issuedToday: Number(i.issuedToday ?? 0),
        overdueBooks: Number(i.overdueBooks ?? 0),
        finesPending: Number(i.finesPending ?? 0),
    };
}
