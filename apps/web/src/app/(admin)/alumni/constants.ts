/**
 * Shared alumni constants. Kept out of `actions.ts` because a 'use server'
 * module may only export async functions.
 *
 * Values mirror the `alumni_event_type` and `alumni_event_status` enums in
 * drizzle/0000_init_baseline.sql.
 */

export const ALUMNI_EVENT_TYPES = [
    { value: 'REUNION', label: 'Reunion' },
    { value: 'NETWORKING', label: 'Networking' },
    { value: 'CAREER_TALK', label: 'Career Talk' },
    { value: 'WORKSHOP', label: 'Workshop' },
    { value: 'FUNDRAISER', label: 'Fundraiser' },
] as const;

export const ALUMNI_EVENT_STATUSES: readonly string[] = ['UPCOMING', 'ONGOING', 'COMPLETED'];

export const EVENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
    ALUMNI_EVENT_TYPES.map((t) => [t.value, t.label]),
);
