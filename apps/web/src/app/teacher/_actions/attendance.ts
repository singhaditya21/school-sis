'use server';

import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

/**
 * Attendance for the teacher's OWN sections only.
 *
 * `attendance_records` carries its own tenant_id, but a tenant check alone would
 * let any teacher mark any class in the school. Every function here re-derives
 * the section from sections.class_teacher_id / timetable_entries.teacher_id and
 * refuses anything outside it.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Subset of the attendance_status enum a teacher can set from the roll sheet. */
const MARKABLE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

const OWNED_SECTION_SQL = `
    sec.tenant_id = $1
    AND (
        sec.class_teacher_id = $2
        OR EXISTS (
            SELECT 1 FROM timetable_entries te
            WHERE te.section_id = sec.id AND te.teacher_id = $2 AND te.tenant_id = $1
        )
    )
`;

export interface AttendanceRollRow {
    studentId: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    rollNumber: number | null;
    status: string | null;
    remarks: string | null;
}

/** The roll for one of my sections on one date, with anything already recorded. */
export async function getMyAttendanceRoll(
    sectionId: string,
    date: string
): Promise<AttendanceRollRow[]> {
    if (!UUID_RE.test(sectionId)) return [];
    const { tenantId, userId } = await requireAuth('attendance:read');

    const { rows } = await pool.query(
        `SELECT
            st.id AS "studentId",
            st.admission_number AS "admissionNumber",
            st.first_name AS "firstName",
            st.last_name AS "lastName",
            st.roll_number AS "rollNumber",
            ar.status,
            ar.remarks
         FROM students st
         INNER JOIN sections sec ON sec.id = st.section_id
         LEFT JOIN attendance_records ar
                ON ar.student_id = st.id
               AND ar.date = $4
               AND ar.tenant_id = $1
         WHERE st.section_id = $3
           AND st.tenant_id = $1
           AND st.status = 'ACTIVE'
           AND ${OWNED_SECTION_SQL}
         ORDER BY st.roll_number ASC NULLS LAST, st.first_name ASC`,
        [tenantId, userId, sectionId, date]
    );

    return rows;
}

export interface TodayAttendanceSummary {
    sectionId: string;
    marked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
}

/** Per-section counts for a date, restricted to my sections. */
export async function getMyAttendanceSummary(date: string): Promise<TodayAttendanceSummary[]> {
    const { tenantId, userId } = await requireAuth('attendance:read');

    const { rows } = await pool.query(
        `SELECT
            sec.id AS "sectionId",
            COUNT(ar.id)::int AS "marked",
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT')::int AS "present",
            COUNT(*) FILTER (WHERE ar.status = 'ABSENT')::int AS "absent",
            COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS "late",
            COUNT(*) FILTER (WHERE ar.status = 'EXCUSED')::int AS "excused"
         FROM sections sec
         LEFT JOIN attendance_records ar
                ON ar.section_id = sec.id
               AND ar.tenant_id = $1
               AND ar.date = $3
         WHERE ${OWNED_SECTION_SQL}
         GROUP BY sec.id`,
        [tenantId, userId, date]
    );

    return rows;
}

export interface MarkAttendanceResult {
    success: boolean;
    error?: string;
    saved?: number;
}

/**
 * Flat result: Next.js erases discriminated-union narrowing across the
 * 'use server' boundary, so the client reads `success` off a plain object.
 */
export async function markMyAttendance(input: {
    sectionId: string;
    date: string;
    entries: { studentId: string; status: string }[];
}): Promise<MarkAttendanceResult> {
    const { tenantId, userId } = await requireAuth('attendance:write');

    if (!UUID_RE.test(input.sectionId)) {
        return { success: false, error: 'Invalid section.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        return { success: false, error: 'Invalid date.' };
    }
    if (input.entries.length === 0) {
        return { success: false, error: 'No attendance entries were submitted.' };
    }
    for (const entry of input.entries) {
        if (!UUID_RE.test(entry.studentId)) {
            return { success: false, error: 'Invalid student in submission.' };
        }
        if (!MARKABLE_STATUSES.includes(entry.status as MarkableStatus)) {
            return { success: false, error: `Unsupported attendance status "${entry.status}".` };
        }
    }

    const ownedRes = await pool.query(
        `SELECT sec.id FROM sections sec WHERE sec.id = $3 AND ${OWNED_SECTION_SQL}`,
        [tenantId, userId, input.sectionId]
    );
    if (ownedRes.rows.length === 0) {
        return { success: false, error: 'That class is not assigned to you.' };
    }

    // Every student in the submission must actually sit in that section.
    const studentIds = Array.from(new Set(input.entries.map((e) => e.studentId)));
    const memberRes = await pool.query(
        `SELECT id FROM students
         WHERE tenant_id = $1 AND section_id = $2 AND id = ANY($3::uuid[])`,
        [tenantId, input.sectionId, studentIds]
    );
    if (memberRes.rows.length !== studentIds.length) {
        return { success: false, error: 'Submission contained students from another section.' };
    }

    // attendance_records has no unique key on (student, date), so update-then-insert.
    let saved = 0;
    for (const entry of input.entries) {
        const existing = await pool.query(
            `SELECT id FROM attendance_records
             WHERE student_id = $1 AND date = $2 AND tenant_id = $3`,
            [entry.studentId, input.date, tenantId]
        );

        if (existing.rows.length > 0) {
            await pool.query(
                `UPDATE attendance_records
                 SET status = $1, marked_by = $2, section_id = $3, updated_at = NOW()
                 WHERE id = $4 AND tenant_id = $5`,
                [entry.status, userId, input.sectionId, existing.rows[0].id, tenantId]
            );
        } else {
            await pool.query(
                `INSERT INTO attendance_records (id, tenant_id, student_id, section_id, date, status, marked_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [randomUUID(), tenantId, entry.studentId, input.sectionId, input.date, entry.status, userId]
            );
        }
        saved += 1;
    }

    revalidatePath('/teacher/attendance');
    revalidatePath(`/teacher/attendance/${input.sectionId}`);

    return { success: true, saved };
}
