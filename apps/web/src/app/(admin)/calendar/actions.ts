'use server';

/**
 * Academic calendar server actions.
 *
 * These read/write `academic_events` directly rather than going through
 * `lib/actions/calendar.ts` for two reasons:
 *  - `date` columns come back from node-postgres as JS `Date` objects, which cannot be
 *    handed to a client component or rendered as a React child. Everything here is
 *    formatted to `YYYY-MM-DD` in SQL.
 *  - enum values (`event_type`, `audience_type`) are validated before they reach the
 *    database, so a bad value is a form error rather than a 500.
 */

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import {
    isAudienceType,
    isEventType,
    type ActionResult,
    type CalendarEvent,
    type CalendarSummary,
} from './types';

const EVENT_COLUMNS = `
    id,
    title,
    description,
    event_type AS "eventType",
    to_char(start_date, 'YYYY-MM-DD') AS "startDate",
    to_char(end_date, 'YYYY-MM-DD')   AS "endDate",
    is_all_day AS "isAllDay",
    start_time AS "startTime",
    end_time   AS "endTime",
    venue,
    audience_type AS "audienceType",
    color
`;

function mapEvent(row: Record<string, unknown>): CalendarEvent {
    return {
        id: String(row.id),
        title: String(row.title),
        description: (row.description as string) ?? null,
        eventType: row.eventType as CalendarEvent['eventType'],
        startDate: String(row.startDate),
        endDate: (row.endDate as string) ?? null,
        isAllDay: Boolean(row.isAllDay),
        startTime: (row.startTime as string) ?? null,
        endTime: (row.endTime as string) ?? null,
        venue: (row.venue as string) ?? null,
        audienceType: row.audienceType as CalendarEvent['audienceType'],
        color: (row.color as string) ?? null,
    };
}

/**
 * Every event that overlaps the given month, plus the surrounding grid days.
 * Multi-day events that start before the month are included, which is why the
 * predicate compares the whole range rather than just `start_date`.
 */
export async function getEventsInRange(from: string, to: string): Promise<CalendarEvent[]> {
    const { tenantId } = await requireAuth('calendar:read');

    const { rows } = await pool.query(
        `SELECT ${EVENT_COLUMNS}
           FROM academic_events
          WHERE tenant_id = $1
            AND start_date <= $3::date
            AND COALESCE(end_date, start_date) >= $2::date
          ORDER BY start_date ASC, start_time ASC NULLS FIRST`,
        [tenantId, from, to],
    );
    return rows.map(mapEvent);
}

export async function getUpcomingEvents(limit = 10): Promise<CalendarEvent[]> {
    const { tenantId } = await requireAuth('calendar:read');

    const { rows } = await pool.query(
        `SELECT ${EVENT_COLUMNS}
           FROM academic_events
          WHERE tenant_id = $1
            AND COALESCE(end_date, start_date) >= CURRENT_DATE
          ORDER BY start_date ASC, start_time ASC NULLS FIRST
          LIMIT $2`,
        [tenantId, limit],
    );
    return rows.map(mapEvent);
}

export async function getCalendarSummary(): Promise<CalendarSummary> {
    const { tenantId } = await requireAuth('calendar:read');

    const [totals, byType] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE COALESCE(end_date, start_date) >= CURRENT_DATE)::int AS upcoming
               FROM academic_events
              WHERE tenant_id = $1`,
            [tenantId],
        ),
        pool.query(
            `SELECT event_type AS "eventType", COUNT(*)::int AS count
               FROM academic_events
              WHERE tenant_id = $1
              GROUP BY event_type`,
            [tenantId],
        ),
    ]);

    const counts: Record<string, number> = {};
    for (const row of byType.rows) counts[row.eventType] = Number(row.count);

    return {
        total: Number(totals.rows[0]?.total ?? 0),
        upcoming: Number(totals.rows[0]?.upcoming ?? 0),
        byType: counts,
    };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveEvent(input: {
    id?: string;
    title: string;
    description?: string;
    eventType: string;
    startDate: string;
    endDate?: string;
    isAllDay: boolean;
    startTime?: string;
    endTime?: string;
    venue?: string;
    audienceType: string;
}): Promise<ActionResult & { eventId?: string }> {
    const { tenantId, userId } = await requireAuth('calendar:write');

    const title = input.title.trim();
    if (!title) return { success: false, error: 'Give the event a title.' };
    if (!isEventType(input.eventType)) return { success: false, error: 'Choose a valid event type.' };
    if (!isAudienceType(input.audienceType)) return { success: false, error: 'Choose a valid audience.' };
    if (!ISO_DATE.test(input.startDate)) return { success: false, error: 'Choose a start date.' };

    const endDate = input.endDate && ISO_DATE.test(input.endDate) ? input.endDate : null;
    if (endDate && endDate < input.startDate) {
        return { success: false, error: 'The end date cannot be before the start date.' };
    }

    let startTime: string | null = null;
    let endTime: string | null = null;
    if (!input.isAllDay) {
        startTime = (input.startTime || '').trim() || null;
        endTime = (input.endTime || '').trim() || null;
        if (!startTime) return { success: false, error: 'A timed event needs a start time.' };
        if (!CLOCK_TIME.test(startTime)) return { success: false, error: 'Start time must be HH:MM.' };
        if (endTime && !CLOCK_TIME.test(endTime)) {
            return { success: false, error: 'End time must be HH:MM.' };
        }
        if (endTime && !endDate && endTime <= startTime) {
            return { success: false, error: 'The end time must be after the start time.' };
        }
    }

    const venue = (input.venue || '').trim() || null;
    const description = (input.description || '').trim() || null;

    try {
        if (input.id) {
            const { rowCount } = await pool.query(
                `UPDATE academic_events
                    SET title = $1, description = $2, event_type = $3, start_date = $4::date,
                        end_date = $5::date, is_all_day = $6, start_time = $7, end_time = $8,
                        venue = $9, audience_type = $10, updated_at = NOW()
                  WHERE id = $11 AND tenant_id = $12`,
                [
                    title,
                    description,
                    input.eventType,
                    input.startDate,
                    endDate,
                    input.isAllDay,
                    startTime,
                    endTime,
                    venue,
                    input.audienceType,
                    input.id,
                    tenantId,
                ],
            );
            if (!rowCount) return { success: false, error: 'Event not found.' };
            revalidatePath('/calendar');
            return { success: true, eventId: input.id };
        }

        const { rows } = await pool.query(
            `INSERT INTO academic_events (
                tenant_id, title, description, event_type, start_date, end_date,
                is_all_day, start_time, end_time, venue, audience_type, created_by
             ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12)
             RETURNING id`,
            [
                tenantId,
                title,
                description,
                input.eventType,
                input.startDate,
                endDate,
                input.isAllDay,
                startTime,
                endTime,
                venue,
                input.audienceType,
                userId,
            ],
        );
        revalidatePath('/calendar');
        return { success: true, eventId: rows[0].id };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not save the event.',
        };
    }
}

export async function removeEvent(eventId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('calendar:write');

    const { rowCount } = await pool.query(
        `DELETE FROM academic_events WHERE id = $1 AND tenant_id = $2`,
        [eventId, tenantId],
    );
    if (!rowCount) return { success: false, error: 'Event not found.' };

    revalidatePath('/calendar');
    return { success: true };
}
