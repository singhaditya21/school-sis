'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Teacher scope.
 *
 * A teacher is attached to a section in exactly two ways in this schema:
 *   - `sections.class_teacher_id` — they are the class teacher, or
 *   - `timetable_entries.teacher_id` — they teach at least one period there.
 *
 * There is no teacher<->section assignment table beyond those two, so every
 * screen in this portal resolves "my classes" through this one query. The old
 * /teacher/my-classes called getSectionsForTimetable(), which returns every
 * section in the tenant — a teacher saw all 39 sections of the school as
 * "My Classes". Nothing below is tenant-wide.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TeacherClass {
    sectionId: string;
    gradeId: string;
    gradeName: string;
    sectionName: string;
    roomNumber: string | null;
    isClassTeacher: boolean;
    /** Comma-separated subject names this teacher teaches in this section. Empty when they are only the class teacher. */
    subjects: string;
    periodsPerWeek: number;
    studentCount: number;
}

export async function getMyClasses(): Promise<TeacherClass[]> {
    const { tenantId, userId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT
            sec.id AS "sectionId",
            sec.grade_id AS "gradeId",
            g.name AS "gradeName",
            sec.name AS "sectionName",
            sec.room_number AS "roomNumber",
            (sec.class_teacher_id = $2) AS "isClassTeacher",
            COALESCE((
                SELECT string_agg(DISTINCT sub.name, ', ')
                FROM timetable_entries te
                INNER JOIN subjects sub ON sub.id = te.subject_id
                WHERE te.section_id = sec.id AND te.teacher_id = $2 AND te.tenant_id = $1
            ), '') AS "subjects",
            (
                SELECT COUNT(*)::int
                FROM timetable_entries te
                WHERE te.section_id = sec.id AND te.teacher_id = $2 AND te.tenant_id = $1
            ) AS "periodsPerWeek",
            (
                SELECT COUNT(*)::int
                FROM students st
                WHERE st.section_id = sec.id AND st.tenant_id = $1 AND st.status = 'ACTIVE'
            ) AS "studentCount"
         FROM sections sec
         INNER JOIN grades g ON g.id = sec.grade_id
         WHERE sec.tenant_id = $1
           AND (
                sec.class_teacher_id = $2
                OR EXISTS (
                    SELECT 1 FROM timetable_entries te
                    WHERE te.section_id = sec.id AND te.teacher_id = $2 AND te.tenant_id = $1
                )
           )
         ORDER BY g.display_order ASC, sec.name ASC`,
        [tenantId, userId]
    );

    return rows;
}

export interface TeacherSectionRef {
    sectionId: string;
    gradeId: string;
    gradeName: string;
    sectionName: string;
}

/**
 * Resolve one section, but only if it is this teacher's. Returns null otherwise —
 * callers render notFound() rather than leaking another class's roll.
 */
export async function getMySection(sectionId: string): Promise<TeacherSectionRef | null> {
    if (!UUID_RE.test(sectionId)) return null;
    const { tenantId, userId } = await requireAuth('timetable:read');

    const { rows } = await pool.query(
        `SELECT sec.id AS "sectionId", sec.grade_id AS "gradeId", g.name AS "gradeName", sec.name AS "sectionName"
         FROM sections sec
         INNER JOIN grades g ON g.id = sec.grade_id
         WHERE sec.id = $3 AND sec.tenant_id = $1
           AND (
                sec.class_teacher_id = $2
                OR EXISTS (
                    SELECT 1 FROM timetable_entries te
                    WHERE te.section_id = sec.id AND te.teacher_id = $2 AND te.tenant_id = $1
                )
           )`,
        [tenantId, userId, sectionId]
    );

    return rows[0] ?? null;
}
