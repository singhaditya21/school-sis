'use server';

/**
 * Server actions for substitution cover.
 *
 * The old screen treated `users.is_active` as "absent today", which really
 * means "login disabled" — a deactivated account, not someone on leave. Real
 * absence lives in `leave_requests` (status APPROVED, today between from_date
 * and to_date), joined to a user through `staff_profiles.user_id`.
 *
 * `substitution_requests.period` is a plain integer with no foreign key, so it
 * is matched against `periods.display_order`, which is what the period picker
 * submits.
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { dayOfWeekForIsoDate, isIsoDate } from '../_lib/days';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AbsentTeacher {
    userId: string;
    name: string;
    leaveType: string;
    reason: string | null;
    fromDate: string;
    toDate: string;
}

export interface TeacherOption {
    id: string;
    name: string;
    weeklyPeriods: number;
}

export interface CoverObligation {
    entryId: string;
    periodOrder: number;
    periodName: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    sectionId: string;
    className: string;
    roomNumber: string | null;
    coveredBy: string | null;
}

export interface SubstitutionRequestRow {
    id: string;
    date: string;
    period: number;
    periodName: string | null;
    status: string;
    reason: string | null;
    teacherId: string;
    originalTeacher: string;
    substituteId: string | null;
    substitute: string | null;
    sectionId: string | null;
    className: string | null;
    linkedEntryId: string | null;
}

export interface SubstitutionResult {
    success: boolean;
    error?: string;
    message?: string;
}

// ─── Reads ───────────────────────────────────────────────────

export async function listAbsentTeachers(date: string): Promise<AbsentTeacher[]> {
    const { tenantId } = await requireAuth('timetable:read');
    if (!isIsoDate(date)) return [];

    const { rows } = await pool.query(
        `SELECT u.id AS "userId",
                u.first_name || ' ' || u.last_name AS name,
                lr.leave_type::text AS "leaveType",
                lr.reason,
                lr.from_date::text AS "fromDate",
                lr.to_date::text AS "toDate"
         FROM leave_requests lr
         INNER JOIN staff_profiles sp ON sp.id = lr.staff_id AND sp.tenant_id = lr.tenant_id
         INNER JOIN users u ON u.id = sp.user_id AND u.tenant_id = lr.tenant_id
         WHERE lr.tenant_id = $1
           AND lr.status = 'APPROVED'
           AND u.role = 'TEACHER'
           AND $2::date BETWEEN lr.from_date AND lr.to_date
         ORDER BY u.first_name ASC`,
        [tenantId, date]
    );

    return rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        leaveType: row.leaveType,
        reason: row.reason,
        fromDate: row.fromDate,
        toDate: row.toDate,
    }));
}

export async function listTeacherOptions(): Promise<TeacherOption[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT u.id,
                u.first_name || ' ' || u.last_name AS name,
                COUNT(te.id)::int AS "weeklyPeriods"
         FROM users u
         LEFT JOIN timetable_entries te
                ON te.teacher_id = u.id AND te.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1 AND u.role = 'TEACHER' AND u.is_active = true
         GROUP BY u.id, u.first_name, u.last_name
         ORDER BY u.first_name ASC`,
        [tenantId]
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        weeklyPeriods: Number(row.weeklyPeriods),
    }));
}

/** What a teacher is actually timetabled to teach on a given calendar date. */
export async function listCoverObligations(teacherId: string, date: string): Promise<CoverObligation[]> {
    const { tenantId } = await requireAuth('timetable:read');
    if (!UUID_RE.test(teacherId)) return [];

    const dayOfWeek = dayOfWeekForIsoDate(date);
    if (!dayOfWeek) return [];

    const { rows } = await pool.query(
        `SELECT te.id AS "entryId",
                p.display_order AS "periodOrder",
                p.name AS "periodName",
                p.start_time AS "startTime",
                p.end_time AS "endTime",
                s.name AS "subjectName",
                te.section_id AS "sectionId",
                g.name || '-' || sec.name AS "className",
                te.room_number AS "roomNumber",
                cover.first_name || ' ' || cover.last_name AS "coveredBy"
         FROM timetable_entries te
         INNER JOIN periods p ON p.id = te.period_id AND p.tenant_id = te.tenant_id
         INNER JOIN subjects s ON s.id = te.subject_id AND s.tenant_id = te.tenant_id
         INNER JOIN sections sec ON sec.id = te.section_id AND sec.tenant_id = te.tenant_id
         INNER JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = te.tenant_id
         LEFT JOIN substitutions sub
                ON sub.timetable_entry_id = te.id
               AND sub.tenant_id = te.tenant_id
               AND sub.date = $3
         LEFT JOIN users cover
                ON cover.id = sub.substitute_teacher_id AND cover.tenant_id = te.tenant_id
         WHERE te.tenant_id = $1 AND te.teacher_id = $2 AND te.day_of_week = $4
         ORDER BY p.display_order ASC`,
        [tenantId, teacherId, date, dayOfWeek]
    );

    return rows.map((row) => ({
        entryId: row.entryId,
        periodOrder: Number(row.periodOrder),
        periodName: row.periodName,
        startTime: row.startTime,
        endTime: row.endTime,
        subjectName: row.subjectName,
        sectionId: row.sectionId,
        className: row.className,
        roomNumber: row.roomNumber,
        coveredBy: row.coveredBy,
    }));
}

/**
 * Teachers with nothing timetabled in that weekday+period slot and no approved
 * leave covering the date. Returns an empty list on a Sunday (the day_of_week
 * enum has no SUNDAY, so nothing can be scheduled then).
 */
export async function listFreeTeachersForSlot(input: {
    date: string;
    periodOrder: number;
    excludeTeacherId?: string;
}): Promise<TeacherOption[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const dayOfWeek = dayOfWeekForIsoDate(input.date);
    if (!dayOfWeek) return [];

    const periodOrder = Number(input.periodOrder);
    if (!Number.isInteger(periodOrder)) return [];

    const exclude = input.excludeTeacherId && UUID_RE.test(input.excludeTeacherId)
        ? input.excludeTeacherId
        : null;

    const { rows } = await pool.query(
        `SELECT u.id,
                u.first_name || ' ' || u.last_name AS name,
                COUNT(load.id)::int AS "weeklyPeriods"
         FROM users u
         LEFT JOIN timetable_entries load
                ON load.teacher_id = u.id AND load.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1
           AND u.role = 'TEACHER'
           AND u.is_active = true
           AND ($4::uuid IS NULL OR u.id <> $4::uuid)
           AND NOT EXISTS (
               SELECT 1
               FROM timetable_entries busy
               INNER JOIN periods p ON p.id = busy.period_id AND p.tenant_id = busy.tenant_id
               WHERE busy.tenant_id = u.tenant_id
                 AND busy.teacher_id = u.id
                 AND busy.day_of_week = $2
                 AND p.display_order = $3
           )
           AND NOT EXISTS (
               SELECT 1
               FROM leave_requests lr
               INNER JOIN staff_profiles sp ON sp.id = lr.staff_id AND sp.tenant_id = lr.tenant_id
               WHERE lr.tenant_id = u.tenant_id
                 AND sp.user_id = u.id
                 AND lr.status = 'APPROVED'
                 AND $5::date BETWEEN lr.from_date AND lr.to_date
           )
         GROUP BY u.id, u.first_name, u.last_name
         ORDER BY COUNT(load.id) ASC, u.first_name ASC`,
        [tenantId, dayOfWeek, periodOrder, exclude, input.date]
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        weeklyPeriods: Number(row.weeklyPeriods),
    }));
}

export async function listSubstitutionRequests(): Promise<SubstitutionRequestRow[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT sr.id,
                sr.date,
                sr.period,
                sr.status,
                sr.reason,
                sr.teacher_id AS "teacherId",
                ot.first_name || ' ' || ot.last_name AS "originalTeacher",
                sr.substitute_id AS "substituteId",
                st.first_name || ' ' || st.last_name AS substitute,
                sr.section_id AS "sectionId",
                g.name || '-' || sec.name AS "className",
                p.name AS "periodName",
                cover.id AS "linkedEntryId"
         FROM substitution_requests sr
         INNER JOIN users ot ON ot.id = sr.teacher_id AND ot.tenant_id = sr.tenant_id
         LEFT JOIN users st ON st.id = sr.substitute_id AND st.tenant_id = sr.tenant_id
         LEFT JOIN sections sec ON sec.id = sr.section_id AND sec.tenant_id = sr.tenant_id
         LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = sr.tenant_id
         LEFT JOIN LATERAL (
             SELECT pr.name
             FROM periods pr
             WHERE pr.tenant_id = sr.tenant_id AND pr.display_order = sr.period
             LIMIT 1
         ) p ON true
         LEFT JOIN LATERAL (
             SELECT sub.timetable_entry_id AS id
             FROM substitutions sub
             INNER JOIN timetable_entries te
                     ON te.id = sub.timetable_entry_id AND te.tenant_id = sub.tenant_id
             WHERE sub.tenant_id = sr.tenant_id
               AND sub.date = sr.date
               AND sub.original_teacher_id = sr.teacher_id
               AND te.section_id IS NOT DISTINCT FROM sr.section_id
             LIMIT 1
         ) cover ON true
         WHERE sr.tenant_id = $1
         ORDER BY sr.date DESC, sr.period ASC`,
        [tenantId]
    );

    return rows.map((row) => ({
        id: row.id,
        date: row.date,
        period: Number(row.period),
        periodName: row.periodName,
        status: row.status ?? 'pending',
        reason: row.reason,
        teacherId: row.teacherId,
        originalTeacher: row.originalTeacher,
        substituteId: row.substituteId,
        substitute: row.substitute,
        sectionId: row.sectionId,
        className: row.className,
        linkedEntryId: row.linkedEntryId,
    }));
}

// ─── Writes ──────────────────────────────────────────────────

export async function submitSubstitutionRequest(input: {
    date: string;
    teacherId: string;
    sectionId: string;
    periodOrder: number;
    substituteId?: string;
    reason?: string;
}): Promise<SubstitutionResult> {
    const { tenantId } = await requireAuth('timetable:write');

    if (!isIsoDate(input.date)) return { success: false, error: 'Pick a valid date.' };
    if (!UUID_RE.test(input.teacherId)) return { success: false, error: 'Select the absent teacher.' };
    if (!UUID_RE.test(input.sectionId)) return { success: false, error: 'Select the class that needs cover.' };

    const periodOrder = Number(input.periodOrder);
    if (!Number.isInteger(periodOrder) || periodOrder < 1) {
        return { success: false, error: 'Select a period.' };
    }

    const substituteId = input.substituteId?.trim() || null;
    if (substituteId && !UUID_RE.test(substituteId)) {
        return { success: false, error: 'Invalid substitute teacher.' };
    }
    if (substituteId && substituteId === input.teacherId) {
        return { success: false, error: 'A teacher cannot substitute for themselves.' };
    }

    const reason = (input.reason ?? '').trim().slice(0, 255) || null;

    const { rows: teacherRows } = await pool.query(
        `SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'TEACHER' LIMIT 1`,
        [input.teacherId, tenantId]
    );
    if (teacherRows.length === 0) return { success: false, error: 'Absent teacher not found in this school.' };

    const { rows: sectionRows } = await pool.query(
        `SELECT 1 FROM sections WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [input.sectionId, tenantId]
    );
    if (sectionRows.length === 0) return { success: false, error: 'Class not found in this school.' };

    if (substituteId) {
        const { rows: subRows } = await pool.query(
            `SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'TEACHER' AND is_active = true LIMIT 1`,
            [substituteId, tenantId]
        );
        if (subRows.length === 0) return { success: false, error: 'Substitute teacher not found in this school.' };
    }

    const { rows: duplicate } = await pool.query(
        `SELECT 1 FROM substitution_requests
         WHERE tenant_id = $1 AND teacher_id = $2 AND date = $3 AND period = $4
           AND section_id IS NOT DISTINCT FROM $5
           AND status <> 'rejected'
         LIMIT 1`,
        [tenantId, input.teacherId, input.date, periodOrder, input.sectionId]
    );
    if (duplicate.length > 0) {
        return { success: false, error: 'A request already exists for this teacher, class, date and period.' };
    }

    await pool.query(
        `INSERT INTO substitution_requests
             (id, tenant_id, teacher_id, substitute_id, section_id, period, date, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [randomUUID(), tenantId, input.teacherId, substituteId, input.sectionId, periodOrder, input.date, reason]
    );

    revalidatePath('/timetable/substitution');
    return { success: true };
}

/**
 * Approve or reject a request.
 *
 * Approving with a substitute also writes the concrete `substitutions` row
 * against the matching timetable entry, so the cover shows up on the weekly
 * grid. If no entry matches (nothing timetabled for that teacher, class,
 * weekday and period) the request is still approved, and the caller is told
 * plainly that it could not be attached to a slot.
 */
export async function resolveSubstitutionRequest(input: {
    requestId: string;
    decision: 'approved' | 'rejected';
    substituteId?: string;
}): Promise<SubstitutionResult> {
    const { tenantId } = await requireAuth('timetable:write');

    if (!UUID_RE.test(input.requestId)) return { success: false, error: 'Invalid request id.' };
    if (input.decision !== 'approved' && input.decision !== 'rejected') {
        return { success: false, error: 'Unknown decision.' };
    }

    const { rows: requestRows } = await pool.query(
        `SELECT id, teacher_id AS "teacherId", substitute_id AS "substituteId",
                section_id AS "sectionId", period, date, reason, status
         FROM substitution_requests
         WHERE id = $1 AND tenant_id = $2
         LIMIT 1`,
        [input.requestId, tenantId]
    );
    const request = requestRows[0];
    if (!request) return { success: false, error: 'Substitution request not found.' };
    if (request.status !== 'pending') {
        return { success: false, error: `This request is already ${request.status}.` };
    }

    if (input.decision === 'rejected') {
        await pool.query(
            `UPDATE substitution_requests SET status = 'rejected' WHERE id = $1 AND tenant_id = $2`,
            [input.requestId, tenantId]
        );
        revalidatePath('/timetable/substitution');
        return { success: true, message: 'Request rejected.' };
    }

    const chosen = input.substituteId?.trim() || request.substituteId || null;
    if (!chosen) {
        return { success: false, error: 'Assign a substitute teacher before approving.' };
    }
    if (!UUID_RE.test(chosen)) return { success: false, error: 'Invalid substitute teacher.' };
    if (chosen === request.teacherId) {
        return { success: false, error: 'A teacher cannot substitute for themselves.' };
    }

    const { rows: subRows } = await pool.query(
        `SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'TEACHER' AND is_active = true LIMIT 1`,
        [chosen, tenantId]
    );
    if (subRows.length === 0) return { success: false, error: 'Substitute teacher not found in this school.' };

    const dayOfWeek = dayOfWeekForIsoDate(request.date);
    let linkedEntryId: string | null = null;

    if (dayOfWeek && request.sectionId) {
        const { rows: entryRows } = await pool.query(
            `SELECT te.id
             FROM timetable_entries te
             INNER JOIN periods p ON p.id = te.period_id AND p.tenant_id = te.tenant_id
             WHERE te.tenant_id = $1
               AND te.teacher_id = $2
               AND te.section_id = $3
               AND te.day_of_week = $4
               AND p.display_order = $5
             LIMIT 1`,
            [tenantId, request.teacherId, request.sectionId, dayOfWeek, Number(request.period)]
        );
        linkedEntryId = entryRows[0]?.id ?? null;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE substitution_requests
             SET status = 'approved', substitute_id = $3
             WHERE id = $1 AND tenant_id = $2`,
            [input.requestId, tenantId, chosen]
        );

        if (linkedEntryId) {
            await client.query(
                `INSERT INTO substitutions
                     (id, tenant_id, timetable_entry_id, original_teacher_id,
                      substitute_teacher_id, date, reason)
                 SELECT $1, $2, $3, $4, $5, $6, $7
                 WHERE NOT EXISTS (
                     SELECT 1 FROM substitutions s
                     WHERE s.tenant_id = $2 AND s.timetable_entry_id = $3 AND s.date = $6
                 )`,
                [
                    randomUUID(),
                    tenantId,
                    linkedEntryId,
                    request.teacherId,
                    chosen,
                    request.date,
                    request.reason,
                ]
            );
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Could not approve this request.',
        };
    } finally {
        client.release();
    }

    revalidatePath('/timetable/substitution');
    revalidatePath('/timetable/grid');

    return {
        success: true,
        message: linkedEntryId
            ? 'Approved and attached to the timetable slot.'
            : 'Approved. No timetable entry matches this teacher, class, day and period, so the cover is recorded on the request only.',
    };
}

export interface SubstitutionRequestDetailResult {
    success: boolean;
    notFound?: boolean;
    error?: string;
    request?: SubstitutionRequestRow;
}

export async function getSubstitutionRequestDetail(
    requestId: string
): Promise<SubstitutionRequestDetailResult> {
    const { tenantId } = await requireAuth('timetable:read');

    if (!UUID_RE.test(requestId)) {
        return { success: false, error: 'The provided substitution request ID is invalid.' };
    }

    const { rows } = await pool.query(
        `SELECT sr.id,
                sr.date,
                sr.period,
                sr.status,
                sr.reason,
                sr.teacher_id AS "teacherId",
                ot.first_name || ' ' || ot.last_name AS "originalTeacher",
                sr.substitute_id AS "substituteId",
                st.first_name || ' ' || st.last_name AS substitute,
                sr.section_id AS "sectionId",
                g.name || '-' || sec.name AS "className",
                p.name AS "periodName",
                cover.id AS "linkedEntryId"
         FROM substitution_requests sr
         INNER JOIN users ot ON ot.id = sr.teacher_id AND ot.tenant_id = sr.tenant_id
         LEFT JOIN users st ON st.id = sr.substitute_id AND st.tenant_id = sr.tenant_id
         LEFT JOIN sections sec ON sec.id = sr.section_id AND sec.tenant_id = sr.tenant_id
         LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = sr.tenant_id
         LEFT JOIN LATERAL (
             SELECT pr.name
             FROM periods pr
             WHERE pr.tenant_id = sr.tenant_id AND pr.display_order = sr.period
             LIMIT 1
         ) p ON true
         LEFT JOIN LATERAL (
             SELECT sub.timetable_entry_id AS id
             FROM substitutions sub
             INNER JOIN timetable_entries te
                     ON te.id = sub.timetable_entry_id AND te.tenant_id = sub.tenant_id
             WHERE sub.tenant_id = sr.tenant_id
               AND sub.date = sr.date
               AND sub.original_teacher_id = sr.teacher_id
               AND te.section_id IS NOT DISTINCT FROM sr.section_id
             LIMIT 1
         ) cover ON true
         WHERE sr.tenant_id = $1 AND sr.id = $2
         LIMIT 1`,
        [tenantId, requestId]
    );

    const row = rows[0];
    if (!row) {
        return { success: false, notFound: true, error: 'Substitution request not found.' };
    }

    return {
        success: true,
        request: {
            id: row.id,
            date: row.date,
            period: Number(row.period),
            periodName: row.periodName,
            status: row.status ?? 'pending',
            reason: row.reason,
            teacherId: row.teacherId,
            originalTeacher: row.originalTeacher,
            substituteId: row.substituteId,
            substitute: row.substitute,
            sectionId: row.sectionId,
            className: row.className,
            linkedEntryId: row.linkedEntryId,
        },
    };
}
