'use server';

/**
 * Server actions backing the admin timetable grid, period setup and
 * substitution screens.
 *
 * Every statement here is tenant-scoped and parameterised. Column names were
 * checked against apps/web/drizzle/0000_init_baseline.sql:
 *   periods(id, tenant_id, name, start_time, end_time, display_order, is_break)
 *   timetable_entries(id, tenant_id, section_id, period_id, subject_id,
 *                     teacher_id, day_of_week, room_number)
 *   substitution_requests(id, tenant_id, teacher_id, substitute_id, section_id,
 *                         period, date, reason, status)
 *   substitutions(id, tenant_id, timetable_entry_id, original_teacher_id,
 *                 substitute_teacher_id, date, reason)
 *   leave_requests(id, tenant_id, staff_id, leave_type, from_date, to_date,
 *                  total_days, reason, status, ...)
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { createTimetableEntry } from '@/lib/actions/timetable';
import { isDayOfWeek, type DayOfWeek } from '../_lib/days';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GridPeriod {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    displayOrder: number;
    isBreak: boolean;
}

export interface GridEntry {
    id: string;
    periodId: string;
    dayOfWeek: DayOfWeek;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    teacherId: string;
    teacherName: string;
    roomNumber: string | null;
}

export interface GridSectionOption {
    id: string;
    sectionName: string;
    gradeName: string;
    entryCount: number;
}

export interface ActionResult {
    success: boolean;
    error?: string;
}

// ─── Periods ─────────────────────────────────────────────────

export async function listGridPeriods(): Promise<GridPeriod[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT id,
                name,
                start_time AS "startTime",
                end_time AS "endTime",
                display_order AS "displayOrder",
                is_break AS "isBreak"
         FROM periods
         WHERE tenant_id = $1
         ORDER BY display_order ASC`,
        [tenantId]
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        startTime: row.startTime,
        endTime: row.endTime,
        displayOrder: Number(row.displayOrder),
        // is_break is `integer` in the schema, not boolean.
        isBreak: Number(row.isBreak) === 1,
    }));
}

/** How many timetable entries reference each period — used to guard deletes. */
export async function listPeriodUsage(): Promise<{ periodId: string; entryCount: number }[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT te.period_id AS "periodId", COUNT(*)::int AS "entryCount"
         FROM timetable_entries te
         WHERE te.tenant_id = $1
         GROUP BY te.period_id`,
        [tenantId]
    );

    return rows.map((row) => ({ periodId: row.periodId, entryCount: Number(row.entryCount) }));
}

export async function createPeriod(input: {
    name: string;
    startTime: string;
    endTime: string;
    displayOrder: number;
    isBreak: boolean;
}): Promise<ActionResult> {
    const { tenantId } = await requireAuth('timetable:write');

    const name = input.name.trim();
    if (!name) return { success: false, error: 'Period name is required.' };
    if (name.length > 50) return { success: false, error: 'Period name must be 50 characters or fewer.' };

    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(input.startTime)) return { success: false, error: 'Start time must be HH:MM (24-hour).' };
    if (!timeRe.test(input.endTime)) return { success: false, error: 'End time must be HH:MM (24-hour).' };
    if (input.endTime <= input.startTime) {
        return { success: false, error: 'End time must be after start time.' };
    }

    const order = Number(input.displayOrder);
    if (!Number.isInteger(order) || order < 1 || order > 30) {
        return { success: false, error: 'Order must be a whole number between 1 and 30.' };
    }

    const { rows: clash } = await pool.query(
        `SELECT 1 FROM periods WHERE tenant_id = $1 AND display_order = $2 LIMIT 1`,
        [tenantId, order]
    );
    if (clash.length > 0) {
        return { success: false, error: `Another period already uses order ${order}.` };
    }

    await pool.query(
        `INSERT INTO periods (id, tenant_id, name, start_time, end_time, display_order, is_break)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), tenantId, name, input.startTime, input.endTime, order, input.isBreak ? 1 : 0]
    );

    revalidatePath('/timetable/periods');
    revalidatePath('/timetable/grid');
    return { success: true };
}

export async function deletePeriod(periodId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('timetable:write');
    if (!UUID_RE.test(periodId)) return { success: false, error: 'Invalid period id.' };

    const { rows: used } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM timetable_entries
         WHERE tenant_id = $1 AND period_id = $2`,
        [tenantId, periodId]
    );
    const inUse = Number(used[0]?.count ?? 0);
    if (inUse > 0) {
        return {
            success: false,
            error: `This period is still used by ${inUse} timetable ${inUse === 1 ? 'entry' : 'entries'}. Clear them from the grid first.`,
        };
    }

    const result = await pool.query(
        `DELETE FROM periods WHERE id = $1 AND tenant_id = $2`,
        [periodId, tenantId]
    );
    if (result.rowCount === 0) return { success: false, error: 'Period not found.' };

    revalidatePath('/timetable/periods');
    revalidatePath('/timetable/grid');
    return { success: true };
}

// ─── Grid reads ──────────────────────────────────────────────

export async function listGridSections(): Promise<GridSectionOption[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT sec.id,
                sec.name AS "sectionName",
                g.name AS "gradeName",
                COUNT(te.id)::int AS "entryCount"
         FROM sections sec
         INNER JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = sec.tenant_id
         LEFT JOIN timetable_entries te
                ON te.section_id = sec.id AND te.tenant_id = sec.tenant_id
         WHERE sec.tenant_id = $1
         GROUP BY sec.id, sec.name, g.name, g.display_order
         ORDER BY g.display_order ASC, sec.name ASC`,
        [tenantId]
    );

    return rows.map((row) => ({
        id: row.id,
        sectionName: row.sectionName,
        gradeName: row.gradeName,
        entryCount: Number(row.entryCount),
    }));
}

export async function listSectionGridEntries(sectionId: string): Promise<GridEntry[]> {
    const { tenantId } = await requireAuth('timetable:read');
    if (!UUID_RE.test(sectionId)) return [];

    const { rows } = await pool.query(
        `SELECT te.id,
                te.period_id AS "periodId",
                te.day_of_week AS "dayOfWeek",
                te.room_number AS "roomNumber",
                s.id AS "subjectId",
                s.name AS "subjectName",
                s.code AS "subjectCode",
                u.id AS "teacherId",
                u.first_name || ' ' || u.last_name AS "teacherName"
         FROM timetable_entries te
         INNER JOIN subjects s ON s.id = te.subject_id AND s.tenant_id = te.tenant_id
         INNER JOIN users u ON u.id = te.teacher_id AND u.tenant_id = te.tenant_id
         WHERE te.tenant_id = $1 AND te.section_id = $2`,
        [tenantId, sectionId]
    );

    return rows
        .filter((row) => isDayOfWeek(row.dayOfWeek))
        .map((row) => ({
            id: row.id,
            periodId: row.periodId,
            dayOfWeek: row.dayOfWeek as DayOfWeek,
            subjectId: row.subjectId,
            subjectName: row.subjectName,
            subjectCode: row.subjectCode,
            teacherId: row.teacherId,
            teacherName: row.teacherName,
            roomNumber: row.roomNumber,
        }));
}

// ─── Grid writes ─────────────────────────────────────────────

/**
 * Assign a subject+teacher to one grid cell.
 *
 * `createTimetableEntry` in @/lib/actions/timetable already checks teacher and
 * room double-booking, but it deliberately excludes the section being edited
 * (`te.section_id != $5`), so it cannot see that the section itself already has
 * a class in that slot. That check is added here before delegating.
 */
export async function assignGridSlot(input: {
    sectionId: string;
    periodId: string;
    dayOfWeek: string;
    subjectId: string;
    teacherId: string;
    roomNumber?: string;
}): Promise<ActionResult> {
    const { tenantId } = await requireAuth('timetable:write');

    if (!UUID_RE.test(input.sectionId)) return { success: false, error: 'Invalid class.' };
    if (!UUID_RE.test(input.periodId)) return { success: false, error: 'Invalid period.' };
    if (!UUID_RE.test(input.subjectId)) return { success: false, error: 'Select a subject.' };
    if (!UUID_RE.test(input.teacherId)) return { success: false, error: 'Select a teacher.' };
    if (!isDayOfWeek(input.dayOfWeek)) return { success: false, error: 'Invalid day.' };

    const room = input.roomNumber?.trim() ?? '';
    if (room.length > 20) return { success: false, error: 'Room must be 20 characters or fewer.' };

    const { rows: occupied } = await pool.query(
        `SELECT s.name AS "subjectName"
         FROM timetable_entries te
         INNER JOIN subjects s ON s.id = te.subject_id AND s.tenant_id = te.tenant_id
         WHERE te.tenant_id = $1 AND te.section_id = $2
           AND te.period_id = $3 AND te.day_of_week = $4
         LIMIT 1`,
        [tenantId, input.sectionId, input.periodId, input.dayOfWeek]
    );
    if (occupied.length > 0) {
        return {
            success: false,
            error: `This slot already holds ${occupied[0].subjectName}. Clear it before assigning a new subject.`,
        };
    }

    const created = await createTimetableEntry({
        sectionId: input.sectionId,
        periodId: input.periodId,
        dayOfWeek: input.dayOfWeek,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        roomNumber: room || undefined,
    });

    if (!created.success) {
        const first = created.conflicts?.[0];
        return { success: false, error: first ? first.details : 'Could not create this entry.' };
    }

    revalidatePath('/timetable/grid');
    revalidatePath(`/timetable/${input.sectionId}`);
    return { success: true };
}

export async function clearGridSlot(entryId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('timetable:write');
    if (!UUID_RE.test(entryId)) return { success: false, error: 'Invalid entry id.' };

    // substitutions.timetable_entry_id has no ON DELETE rule, so any cover
    // recorded against this slot must go first or the delete would fail.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `DELETE FROM substitutions
             WHERE tenant_id = $1
               AND timetable_entry_id IN (
                   SELECT id FROM timetable_entries WHERE id = $2 AND tenant_id = $1
               )`,
            [tenantId, entryId]
        );
        const result = await client.query(
            `DELETE FROM timetable_entries WHERE id = $1 AND tenant_id = $2`,
            [entryId, tenantId]
        );
        await client.query('COMMIT');
        if (result.rowCount === 0) return { success: false, error: 'Entry not found.' };
    } catch (err) {
        await client.query('ROLLBACK');
        return { success: false, error: err instanceof Error ? err.message : 'Could not clear this slot.' };
    } finally {
        client.release();
    }

    revalidatePath('/timetable/grid');
    return { success: true };
}
