/**
 * Shared types and pure helpers for the academic calendar.
 * Kept out of `actions.ts` because a `'use server'` module may only export
 * async functions.
 */

/** Mirrors the `event_type` enum in the database. */
export const EVENT_TYPES = [
    'HOLIDAY',
    'EXAM',
    'PTM',
    'SPORTS_DAY',
    'CULTURAL',
    'ACADEMIC',
    'OTHER',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Mirrors the `audience_type` enum in the database. */
export const AUDIENCE_TYPES = ['ALL', 'STUDENTS', 'STAFF', 'PARENTS'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
    HOLIDAY: 'Holiday',
    EXAM: 'Exam',
    PTM: 'Parent-teacher meeting',
    SPORTS_DAY: 'Sports day',
    CULTURAL: 'Cultural',
    ACADEMIC: 'Academic',
    OTHER: 'Other',
};

export const EVENT_TYPE_ICON: Record<EventType, string> = {
    HOLIDAY: '🏖️',
    EXAM: '📝',
    PTM: '👨‍👩‍👧',
    SPORTS_DAY: '⚽',
    CULTURAL: '🎭',
    ACADEMIC: '📚',
    OTHER: '📋',
};

/** Tailwind classes per event type: [chip, left border]. */
export const EVENT_TYPE_STYLE: Record<EventType, { chip: string; border: string; dot: string }> = {
    HOLIDAY: { chip: 'bg-destructive-subtle text-destructive-subtle-foreground', border: 'border-destructive', dot: 'bg-destructive' },
    EXAM: { chip: 'bg-warning-subtle text-warning-subtle-foreground', border: 'border-warning', dot: 'bg-warning' },
    PTM: { chip: 'bg-info-subtle text-info-subtle-foreground', border: 'border-info', dot: 'bg-info' },
    SPORTS_DAY: {
        chip: 'bg-success-subtle text-success-subtle-foreground',
        border: 'border-success',
        dot: 'bg-success',
    },
    CULTURAL: { chip: 'bg-accent text-accent-foreground', border: 'border-primary', dot: 'bg-primary' },
    ACADEMIC: {
        chip: 'bg-accent text-accent-foreground',
        border: 'border-primary',
        dot: 'bg-primary',
    },
    OTHER: { chip: 'bg-muted text-foreground', border: 'border-border', dot: 'bg-muted-foreground' },
};

export type CalendarEvent = {
    id: string;
    title: string;
    description: string | null;
    eventType: EventType;
    /** ISO date, `YYYY-MM-DD`. Never a Date object — these cross the server boundary. */
    startDate: string;
    endDate: string | null;
    isAllDay: boolean;
    startTime: string | null;
    endTime: string | null;
    venue: string | null;
    audienceType: AudienceType;
    color: string | null;
};

export type CalendarSummary = {
    total: number;
    upcoming: number;
    byType: Record<string, number>;
};

export type ActionResult = { success: boolean; error?: string };

export function isEventType(value: string): value is EventType {
    return (EVENT_TYPES as readonly string[]).includes(value);
}

export function isAudienceType(value: string): value is AudienceType {
    return (AUDIENCE_TYPES as readonly string[]).includes(value);
}

export function typeStyle(eventType: string) {
    return isEventType(eventType) ? EVENT_TYPE_STYLE[eventType] : EVENT_TYPE_STYLE.OTHER;
}

export function typeLabel(eventType: string): string {
    return isEventType(eventType) ? EVENT_TYPE_LABEL[eventType] : eventType;
}

export function typeIcon(eventType: string): string {
    return isEventType(eventType) ? EVENT_TYPE_ICON[eventType] : '📋';
}

/** `YYYY-MM-DD` for a local calendar day, without UTC drift. */
export function isoDay(year: number, month1: number, day: number): string {
    return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthLabel(year: number, month1: number): string {
    return new Date(year, month1 - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export function daysInMonth(year: number, month1: number): number {
    return new Date(year, month1, 0).getDate();
}

/** Weekday index (0 = Sunday) of the 1st of the month. */
export function firstWeekday(year: number, month1: number): number {
    return new Date(year, month1 - 1, 1).getDay();
}

/** True when `day` falls inside the event's inclusive start..end range. */
export function eventCoversDay(event: CalendarEvent, day: string): boolean {
    const end = event.endDate || event.startDate;
    return day >= event.startDate && day <= end;
}

export function formatDayRange(event: CalendarEvent): string {
    const start = new Date(`${event.startDate}T00:00:00`);
    const startLabel = start.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
    if (!event.endDate || event.endDate === event.startDate) return startLabel;
    const end = new Date(`${event.endDate}T00:00:00`);
    return `${startLabel} → ${end.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })}`;
}
