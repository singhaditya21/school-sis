'use server';

import { db } from '@/lib/db';
import { books, bookIssues, bookReservations, users, students } from '@/lib/db/schema';
import { eq, and, count, asc, desc, sql, lt, ne } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

// ─── Book Catalogue ──────────────────────────────────────────

export async function getBooks(categoryFilter?: string) {
    const { tenantId } = await requireAuth('library:read');

    const conditions = [eq(books.tenantId, tenantId), eq(books.isActive, true)];
    if (categoryFilter && categoryFilter !== 'ALL') {
        conditions.push(eq(books.category, categoryFilter as any));
    }

    return db
        .select({
            id: books.id,
            title: books.title,
            author: books.author,
            isbn: books.isbn,
            publisher: books.publisher,
            edition: books.edition,
            year: books.year,
            category: books.category,
            location: books.location,
            totalCopies: books.totalCopies,
            availableCopies: books.availableCopies,
        })
        .from(books)
        .where(and(...conditions))
        .orderBy(asc(books.title));
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

    await db.insert(books).values({
        id: randomUUID(),
        tenantId,
        title,
        author,
        isbn,
        publisher,
        edition,
        year,
        category: category as any,
        location,
        totalCopies,
        availableCopies: totalCopies,
    });

    return { success: true };
}

// ─── Library Stats ───────────────────────────────────────────

export async function getLibraryStats() {
    const { tenantId } = await requireAuth('library:read');

    const [bookCount] = await db
        .select({ count: count(), totalCopies: sql<string>`SUM(${books.totalCopies})`, availableCopies: sql<string>`SUM(${books.availableCopies})` })
        .from(books)
        .where(and(eq(books.tenantId, tenantId), eq(books.isActive, true)));

    const today = new Date().toISOString().split('T')[0];
    const [overdueCount] = await db
        .select({ count: count() })
        .from(bookIssues)
        .where(and(
            eq(bookIssues.tenantId, tenantId),
            eq(bookIssues.status, 'ISSUED'),
            lt(bookIssues.dueDate, today),
        ));

    const [issuedToday] = await db
        .select({ count: count() })
        .from(bookIssues)
        .where(and(eq(bookIssues.tenantId, tenantId), eq(bookIssues.issueDate, today)));

    const finesResult = await db
        .select({ total: sql<string>`COALESCE(SUM(${bookIssues.fineAmount}::numeric), 0)` })
        .from(bookIssues)
        .where(and(
            eq(bookIssues.tenantId, tenantId),
            eq(bookIssues.isFinePaid, false),
            ne(bookIssues.fineAmount, '0'),
        ));

    return {
        totalBooks: bookCount.count,
        totalCopies: Number(bookCount.totalCopies || 0),
        availableCopies: Number(bookCount.availableCopies || 0),
        overdueBooks: overdueCount.count,
        issuedToday: issuedToday.count,
        totalFinesPending: Number(finesResult[0]?.total || 0),
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
    const [book] = await db
        .select({ availableCopies: books.availableCopies })
        .from(books)
        .where(and(eq(books.id, data.bookId), eq(books.tenantId, tenantId)));

    if (!book || book.availableCopies <= 0) {
        return { success: false, error: 'No copies available' };
    }

    // Create issue record
    await db.insert(bookIssues).values({
        id: randomUUID(),
        tenantId,
        bookId: data.bookId,
        issuedToUserId: data.issuedToUserId,
        issuedToStudentId: data.issuedToStudentId,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: data.dueDate,
        issuedBy: userId,
        remarks: data.remarks,
    });

    // Decrement available copies
    await db.update(books)
        .set({ availableCopies: sql`${books.availableCopies} - 1` })
        .where(eq(books.id, data.bookId));

    return { success: true };
}

export async function returnBook(issueId: string, fineAmount?: number) {
    const { tenantId, userId } = await requireAuth('library:write');

    const [issue] = await db
        .select({ bookId: bookIssues.bookId, status: bookIssues.status })
        .from(bookIssues)
        .where(and(eq(bookIssues.id, issueId), eq(bookIssues.tenantId, tenantId)));

    if (!issue || issue.status !== 'ISSUED') {
        return { success: false, error: 'Invalid issue or already returned' };
    }

    // Mark as returned
    await db.update(bookIssues)
        .set({
            status: 'RETURNED',
            returnDate: new Date().toISOString().split('T')[0],
            returnedTo: userId,
            fineAmount: fineAmount ? String(fineAmount) : '0',
        })
        .where(eq(bookIssues.id, issueId));

    // Increment available copies
    await db.update(books)
        .set({ availableCopies: sql`${books.availableCopies} + 1` })
        .where(eq(books.id, issue.bookId));

    return { success: true };
}

export async function getOverdueList() {
    const { tenantId } = await requireAuth('library:read');
    const today = new Date().toISOString().split('T')[0];

    return db
        .select({
            id: bookIssues.id,
            bookTitle: books.title,
            bookAuthor: books.author,
            borrowerFirstName: users.firstName,
            borrowerLastName: users.lastName,
            issueDate: bookIssues.issueDate,
            dueDate: bookIssues.dueDate,
            fineAmount: bookIssues.fineAmount,
        })
        .from(bookIssues)
        .innerJoin(books, eq(bookIssues.bookId, books.id))
        .innerJoin(users, eq(bookIssues.issuedToUserId, users.id))
        .where(and(
            eq(bookIssues.tenantId, tenantId),
            eq(bookIssues.status, 'ISSUED'),
            lt(bookIssues.dueDate, today),
        ))
        .orderBy(asc(bookIssues.dueDate));
}
