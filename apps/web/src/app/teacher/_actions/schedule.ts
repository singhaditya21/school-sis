'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * The teacher's own timetable for one weekday, plus any approved cover.
 *
 * `substitution_requests` records the period as a plain integer with no foreign
 * key to `periods`, so a cover slot can only be lined up against a period by
 * number. We match it to periods.display_order, and fall back to the digits in
 * the period's name — that is the whole of what the schema makes possible.
 */

/** Mirrors the day_of_week enum. A 'use server' module may only export async functions, so the value list lives in the page. */
export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';

export interface SchedulePeriod {
    periodId: string;
    name: string;
    startTime: string;
    endTime: string;
    displayOrder: number;
    isBreak: boolean;
}

export interface ScheduleEntry {
    periodId: string;
    sectionId: string;
    subjectName: string;
    className: string;
    roomNumber: string | null;
}

export interface ScheduleCover {
    period: number;
    reason: string | null;
    className: string;
    sectionId: string | null;
}

export async function getSchedulePeriods(): Promise<SchedulePeriod[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT id AS "periodId", name, start_time AS "startTime", end_time AS "endTime",
                display_order AS "displayOrder", (is_break <> 0) AS "isBreak"
         FROM periods
         WHERE tenant_id = $1
         ORDER BY display_order ASC`,
        [tenantId]
    );

    return rows;
}

export async function getMyScheduleForDay(day: Weekday): Promise<ScheduleEntry[]> {
    const { tenantId, userId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT
            te.period_id AS "periodId",
            te.section_id AS "sectionId",
            sub.name AS "subjectName",
            g.name || '-' || sec.name AS "className",
            te.room_number AS "roomNumber"
         FROM timetable_entries te
         INNER JOIN subjects sub ON sub.id = te.subject_id
         INNER JOIN sections sec ON sec.id = te.section_id
         INNER JOIN grades g ON g.id = sec.grade_id
         WHERE te.tenant_id = $1 AND te.teacher_id = $2 AND te.day_of_week = $3::day_of_week`,
        [tenantId, userId, day]
    );

    return rows;
}

export async function getMyCoverForDate(date: string): Promise<ScheduleCover[]> {
    const { tenantId, userId } = await requireAuth('substitution:read');

    const { rows } = await pool.query(
        `SELECT
            sr.period,
            sr.reason,
            COALESCE(g.name || '-' || sec.name, 'Class not recorded') AS "className",
            sr.section_id AS "sectionId"
         FROM substitution_requests sr
         LEFT JOIN sections sec ON sec.id = sr.section_id
         LEFT JOIN grades g ON g.id = sec.grade_id
         WHERE sr.tenant_id = $1 AND sr.substitute_id = $2 AND sr.date = $3 AND sr.status = 'approved'
         ORDER BY sr.period ASC`,
        [tenantId, userId, date]
    );

    return rows;
}
