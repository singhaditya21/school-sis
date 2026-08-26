/**
 * Date and time formatting — Indian conventions, one implementation.
 *
 * There are ~20 hand-rolled `formatDate` / `formatDateTime` helpers scattered
 * through apps/web/src/app/**, and they disagree with each other in two ways
 * that users can see:
 *
 *  1. Timezone drift on DATE columns. `new Date('2026-08-26')` parses as UTC
 *     midnight. Rendered in any timezone west of UTC that is 25 Aug — the
 *     wrong day for an admission date, a due date, or a holiday. Some copies
 *     patched around it by appending `T00:00:00`, some by splitting the string,
 *     most not at all.
 *  2. Null handling. Some return 'Invalid Date', some 'N/A', some '—'.
 *
 * This module treats a date-only value as a CALENDAR date and formats it from
 * its parts, so it is timezone-independent and identical on server and client
 * (no React hydration mismatch). Timestamps are formatted in IST, which is the
 * school's timezone regardless of where the render happens.
 */

export const DATE_LOCALE = 'en-IN' as const;

/** Schools in this product operate on IST. Pinning it keeps SSR and CSR equal. */
export const SCHOOL_TIME_ZONE = 'Asia/Kolkata' as const;

export const EMPTY_VALUE = '—';

export type DateInput = Date | string | null | undefined;

const MONTHS_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Coerce to a Date, or null if the value is absent or unparseable.
 * A bare `YYYY-MM-DD` is anchored at local midnight rather than UTC midnight
 * so it stays on the intended calendar day.
 */
export function toDate(value: DateInput): Date | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const trimmed = value.trim();
    if (trimmed === '') return null;

    const parsed = new Date(DATE_ONLY.test(trimmed) ? `${trimmed}T00:00:00` : trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * `26 Aug 2026`. The default date renderer.
 *
 * A `YYYY-MM-DD` string (what a Postgres `date` column gives you) is formatted
 * from its parts and never passes through a timezone.
 */
export function formatDate(value: DateInput, options?: { emptyValue?: string }): string {
    const fallback = options?.emptyValue ?? EMPTY_VALUE;
    if (value === null || value === undefined) return fallback;

    if (typeof value === 'string') {
        const datePart = value.trim().split('T')[0];
        const match = DATE_ONLY.exec(datePart);
        if (match) {
            const [, year, month, day] = match;
            const name = MONTHS_SHORT[Number(month) - 1];
            if (name) return `${day} ${name} ${year}`;
        }
    }

    const date = toDate(value);
    if (!date) return fallback;
    return date.toLocaleDateString(DATE_LOCALE, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: SCHOOL_TIME_ZONE,
    });
}

/** `26 Aug 2026, 09:30 am` — for audit trails, message logs, anything with a clock. */
export function formatDateTime(value: DateInput, options?: { emptyValue?: string }): string {
    const date = toDate(value);
    if (!date) return options?.emptyValue ?? EMPTY_VALUE;
    return date.toLocaleString(DATE_LOCALE, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: SCHOOL_TIME_ZONE,
    });
}

/** `09:30 am`. */
export function formatTime(value: DateInput, options?: { emptyValue?: string }): string {
    const date = toDate(value);
    if (!date) return options?.emptyValue ?? EMPTY_VALUE;
    return date.toLocaleTimeString(DATE_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: SCHOOL_TIME_ZONE,
    });
}

/**
 * `YYYY-MM-DD` in IST — the shape a Postgres `date` column and an
 * `<input type="date">` both expect. Use this instead of
 * `date.toISOString().slice(0, 10)`, which silently shifts the day for any
 * evening timestamp in IST.
 */
export function toDateInputValue(value: DateInput): string {
    const date = toDate(value);
    if (!date) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: SCHOOL_TIME_ZONE,
    }).format(date);
    return parts;
}

/** `just now` / `5 min ago` / `3 h ago` / `2 d ago`, then falls back to a date. */
export function formatTimeAgo(value: DateInput, options?: { emptyValue?: string }): string {
    const date = toDate(value);
    if (!date) return options?.emptyValue ?? EMPTY_VALUE;

    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 0) return formatDate(date);
    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} d ago`;

    return formatDate(date);
}
