/**
 * Library lending policy — SINGLE SOURCE OF TRUTH.
 *
 * The overdue fine rate lives here and nowhere else. The issue screen quotes it
 * to staff (who quote it to parents), `returnBook()` bills it, and the borrowing
 * history screen projects it for books still out. Those three used to carry
 * their own copies of the number and had already drifted (UI said ₹2/day while
 * the charge was ₹5/day — a 2.5x overcharge on every library fine invoice).
 * Import from here instead of writing a literal.
 */

/** Days a book may be borrowed before it is overdue. */
export const LIBRARY_LOAN_PERIOD_DAYS = 14;

/** Overdue fine in RUPEES per calendar day past the due date. */
export const LIBRARY_FINE_PER_DAY = 2;

/** The exact wording shown to staff on the issue screen. */
export const LIBRARY_FINE_RATE_LABEL = `₹${LIBRARY_FINE_PER_DAY} per day after due date`;

/** Normalise a date-only value (or timestamp) to local midnight. */
function startOfDay(value: string | Date): Date {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole calendar days a loan is overdue as of `asOf` (default: now).
 * Returns 0 on or before the due date — the due date itself is not chargeable.
 */
export function overdueDays(dueDate: string | Date, asOf: string | Date = new Date()): number {
    const due = startOfDay(dueDate);
    const end = startOfDay(asOf);
    const diffMs = end.getTime() - due.getTime();
    if (diffMs <= 0) return 0;
    // round, not floor: guards against 23h/25h days on DST-observing servers.
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Overdue fine in RUPEES for a loan due on `dueDate`, measured at `asOf`. */
export function calculateOverdueFine(dueDate: string | Date, asOf: string | Date = new Date()): number {
    return overdueDays(dueDate, asOf) * LIBRARY_FINE_PER_DAY;
}

/** Due date (YYYY-MM-DD) for a book issued on `issueDate` under the standard loan period. */
export function loanDueDate(issueDate: Date = new Date()): string {
    const due = new Date(issueDate.getTime() + LIBRARY_LOAN_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    return due.toISOString().split('T')[0];
}
