/**
 * Shared library constants and view types. Kept out of `actions.ts` because a
 * 'use server' module may only export async functions.
 *
 * BOOK_CATEGORIES mirrors the `book_category` enum and HISTORY_STATUSES the
 * `issue_status` enum in drizzle/0000_init_baseline.sql (plus the derived
 * OVERDUE projection, which is computed, not stored).
 */

export const BOOK_CATEGORIES_LIST = [
    'TEXTBOOK',
    'REFERENCE',
    'FICTION',
    'NON_FICTION',
    'MAGAZINE',
    'NEWSPAPER',
    'JOURNAL',
] as const;

export type BookCategory = (typeof BOOK_CATEGORIES_LIST)[number];

export const HISTORY_STATUS_LIST = ['ALL', 'ISSUED', 'OVERDUE', 'RETURNED', 'LOST'] as const;

export type HistoryStatus = (typeof HISTORY_STATUS_LIST)[number];

export const CATEGORY_BADGE_CLASSES: Record<string, string> = {
    TEXTBOOK: 'bg-blue-100 text-blue-700',
    REFERENCE: 'bg-purple-100 text-purple-700',
    FICTION: 'bg-green-100 text-green-700',
    NON_FICTION: 'bg-orange-100 text-orange-700',
    MAGAZINE: 'bg-pink-100 text-pink-700',
    NEWSPAPER: 'bg-gray-100 text-gray-700',
    JOURNAL: 'bg-teal-100 text-teal-700',
};

export const HISTORY_STATUS_BADGE_CLASSES: Record<string, string> = {
    ISSUED: 'bg-blue-100 text-blue-700',
    OVERDUE: 'bg-red-100 text-red-700',
    RETURNED: 'bg-green-100 text-green-700',
    LOST: 'bg-gray-100 text-gray-700',
};

export interface CatalogueBookView {
    id: string;
    title: string;
    author: string;
    isbn: string | null;
    publisher: string | null;
    edition: string | null;
    year: number | null;
    category: string;
    subject: string | null;
    language: string | null;
    location: string | null;
    price: string | null;
    description: string | null;
    totalCopies: number;
    availableCopies: number;
    /** Copies currently out on loan, counted from book_issues (not the stored counter). */
    onLoan: number;
    isActive: boolean;
}

export interface BorrowingRecordView {
    id: string;
    bookTitle: string | null;
    bookAuthor: string | null;
    studentId: string | null;
    borrowerName: string | null;
    borrowerClass: string | null;
    issueDate: string;
    dueDate: string;
    returnDate: string | null;
    status: string;
    fineAmount: number;
    finePaid: boolean;
}

export interface BorrowingSummaryView {
    total: number;
    issued: number;
    overdue: number;
    returned: number;
    lost: number;
    totalFines: number;
    unpaidFines: number;
}

export interface CatalogueStatsView {
    totalTitles: number;
    totalCopies: number;
    availableCopies: number;
    issuedToday: number;
    overdueBooks: number;
    finesPending: number;
}
