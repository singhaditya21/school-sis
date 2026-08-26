/**
 * Shared day-of-week helpers for the timetable module.
 *
 * `timetable_entries.day_of_week` is the Postgres enum `day_of_week`, which has
 * exactly six values (no SUNDAY). Anything that maps a calendar date onto the
 * weekly grid has to cope with dates that fall outside it.
 */

export const DAY_OF_WEEK_VALUES = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
] as const;

export type DayOfWeek = (typeof DAY_OF_WEEK_VALUES)[number];

export const DAY_LABELS: Record<DayOfWeek, string> = {
    MONDAY: 'Monday',
    TUESDAY: 'Tuesday',
    WEDNESDAY: 'Wednesday',
    THURSDAY: 'Thursday',
    FRIDAY: 'Friday',
    SATURDAY: 'Saturday',
};

export function isDayOfWeek(value: string): value is DayOfWeek {
    return (DAY_OF_WEEK_VALUES as readonly string[]).includes(value);
}

/** ISO date strings are stored as `varchar(10)`; validate before trusting one. */
export function isIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

/**
 * Maps `YYYY-MM-DD` onto the schema enum. Parsed as UTC so the result does not
 * shift with the server timezone. Sundays return null — there is no SUNDAY in
 * the enum, so no timetable row can exist for them.
 */
export function dayOfWeekForIsoDate(value: string): DayOfWeek | null {
    if (!isIsoDate(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday === 0) return null;
    return DAY_OF_WEEK_VALUES[weekday - 1];
}

export function todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
}
