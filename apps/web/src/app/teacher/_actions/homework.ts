'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

/**
 * Homework this teacher set, for this teacher's own sections.
 *
 * NOTE: this deliberately does not call lib/actions/homework.ts. Both
 * getAssignments() and createAssignment() there select
 * `updated_at AS "updatedAt"` from homework_assignments, and that column does
 * not exist (the table only has created_at) — every call throws at runtime.
 * That file is outside this surface, so the fix is reported rather than made.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export interface TeacherHomeworkItem {
    id: string;
    title: string;
    description: string | null;
    dueDate: string;
    maxMarks: number | null;
    createdAt: string;
    gradeName: string | null;
    sectionName: string | null;
    subjectName: string | null;
    sectionId: string | null;
    studentCount: number;
    submissionCount: number;
    gradedCount: number;
}

export async function getMyHomework(): Promise<TeacherHomeworkItem[]> {
    const { tenantId, userId } = await requireAuth('homework:read');

    const { rows } = await pool.query(
        `SELECT
            ha.id,
            ha.title,
            ha.description,
            ha.due_date::text AS "dueDate",
            ha.max_marks AS "maxMarks",
            ha.created_at::text AS "createdAt",
            g.name AS "gradeName",
            sec.name AS "sectionName",
            sub.name AS "subjectName",
            ha.section_id AS "sectionId",
            (
                SELECT COUNT(*)::int FROM students st
                WHERE st.section_id = ha.section_id AND st.tenant_id = $1 AND st.status = 'ACTIVE'
            ) AS "studentCount",
            (
                SELECT COUNT(*)::int FROM homework_submissions hs
                WHERE hs.assignment_id = ha.id AND hs.tenant_id = $1
            ) AS "submissionCount",
            (
                SELECT COUNT(*)::int FROM homework_submissions hs
                WHERE hs.assignment_id = ha.id AND hs.tenant_id = $1 AND hs.marks IS NOT NULL
            ) AS "gradedCount"
         FROM homework_assignments ha
         LEFT JOIN sections sec ON sec.id = ha.section_id
         LEFT JOIN grades g ON g.id = ha.grade_id
         LEFT JOIN subjects sub ON sub.id = ha.subject_id
         WHERE ha.tenant_id = $1 AND ha.assigned_by = $2
         ORDER BY ha.due_date DESC, ha.created_at DESC`,
        [tenantId, userId]
    );

    return rows;
}

export interface TeachingSlot {
    sectionId: string;
    gradeId: string;
    subjectId: string;
    label: string;
}

/**
 * The (section, subject) pairs this teacher actually takes — the only valid
 * targets for a new homework item. A class teacher with no timetable entry has
 * no subject to attach, so they do not appear here.
 */
export async function getMyTeachingSlots(): Promise<TeachingSlot[]> {
    const { tenantId, userId } = await requireAuth('homework:read');

    const { rows } = await pool.query(
        `SELECT DISTINCT
            sec.id AS "sectionId",
            sec.grade_id AS "gradeId",
            sub.id AS "subjectId",
            g.name || ' - ' || sec.name || ' · ' || sub.name AS "label",
            g.display_order AS "gradeOrder"
         FROM timetable_entries te
         INNER JOIN sections sec ON sec.id = te.section_id
         INNER JOIN grades g ON g.id = sec.grade_id
         INNER JOIN subjects sub ON sub.id = te.subject_id
         WHERE te.tenant_id = $1 AND te.teacher_id = $2 AND sec.tenant_id = $1
         ORDER BY "gradeOrder" ASC, "label" ASC`,
        [tenantId, userId]
    );

    return rows.map((r) => ({
        sectionId: r.sectionId,
        gradeId: r.gradeId,
        subjectId: r.subjectId,
        label: r.label,
    }));
}

export interface CreateHomeworkResult {
    success: boolean;
    error?: string;
    assignmentId?: string;
}

export async function createMyHomework(input: {
    title: string;
    description: string;
    sectionId: string;
    subjectId: string;
    dueDate: string;
    maxMarks: string;
}): Promise<CreateHomeworkResult> {
    const { tenantId, userId } = await requireAuth('homework:write');

    const title = input.title.trim();
    if (!title) return { success: false, error: 'Title is required.' };
    if (!UUID_RE.test(input.sectionId)) return { success: false, error: 'Pick one of your classes.' };
    if (!UUID_RE.test(input.subjectId)) return { success: false, error: 'Pick a subject.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { success: false, error: 'Due date is required.' };

    let maxMarks: number | null = null;
    if (input.maxMarks.trim() !== '') {
        const parsed = Number(input.maxMarks);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return { success: false, error: 'Max marks must be a whole number above zero.' };
        }
        maxMarks = parsed;
    }

    // The (section, subject) pair must be one this teacher actually takes.
    const slotRes = await pool.query(
        `SELECT sec.grade_id AS "gradeId"
         FROM timetable_entries te
         INNER JOIN sections sec ON sec.id = te.section_id
         WHERE te.tenant_id = $1 AND te.teacher_id = $2
           AND te.section_id = $3 AND te.subject_id = $4
         LIMIT 1`,
        [tenantId, userId, input.sectionId, input.subjectId]
    );
    if (slotRes.rows.length === 0) {
        return { success: false, error: 'You do not teach that subject to that class.' };
    }

    const { rows } = await pool.query(
        `INSERT INTO homework_assignments
            (tenant_id, subject_id, grade_id, section_id, title, description, due_date, assigned_by, max_marks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
            tenantId,
            input.subjectId,
            slotRes.rows[0].gradeId,
            input.sectionId,
            title,
            input.description.trim() || null,
            input.dueDate,
            userId,
            maxMarks,
        ]
    );

    revalidatePath('/teacher/homework');

    return { success: true, assignmentId: rows[0].id };
}

export interface HomeworkDetail {
    id: string;
    title: string;
    description: string | null;
    dueDate: string;
    maxMarks: number | null;
    gradeName: string | null;
    sectionName: string | null;
    subjectName: string | null;
    sectionId: string | null;
}

export async function getMyHomeworkDetail(assignmentId: string): Promise<HomeworkDetail | null> {
    if (!UUID_RE.test(assignmentId)) return null;
    const { tenantId, userId } = await requireAuth('homework:read');

    const { rows } = await pool.query(
        `SELECT
            ha.id, ha.title, ha.description,
            ha.due_date::text AS "dueDate",
            ha.max_marks AS "maxMarks",
            g.name AS "gradeName",
            sec.name AS "sectionName",
            sub.name AS "subjectName",
            ha.section_id AS "sectionId"
         FROM homework_assignments ha
         LEFT JOIN sections sec ON sec.id = ha.section_id
         LEFT JOIN grades g ON g.id = ha.grade_id
         LEFT JOIN subjects sub ON sub.id = ha.subject_id
         WHERE ha.id = $3 AND ha.tenant_id = $1 AND ha.assigned_by = $2`,
        [tenantId, userId, assignmentId]
    );

    return rows[0] ?? null;
}

export interface HomeworkRosterRow {
    studentId: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    rollNumber: number | null;
    submissionId: string | null;
    submittedAt: string | null;
    content: string | null;
    marks: number | null;
    feedback: string | null;
}

/**
 * The full class roll with each pupil's submission (or lack of one) — a list of
 * only the submissions would silently hide who has not handed anything in.
 */
export async function getMyHomeworkRoster(assignmentId: string): Promise<HomeworkRosterRow[]> {
    if (!UUID_RE.test(assignmentId)) return [];
    const { tenantId, userId } = await requireAuth('homework:read');

    const { rows } = await pool.query(
        `SELECT
            st.id AS "studentId",
            st.admission_number AS "admissionNumber",
            st.first_name AS "firstName",
            st.last_name AS "lastName",
            st.roll_number AS "rollNumber",
            hs.id AS "submissionId",
            hs.submitted_at::text AS "submittedAt",
            hs.content,
            hs.marks,
            hs.feedback
         FROM homework_assignments ha
         INNER JOIN sections sec ON sec.id = ha.section_id
         INNER JOIN students st ON st.section_id = sec.id AND st.tenant_id = $1 AND st.status = 'ACTIVE'
         LEFT JOIN homework_submissions hs
                ON hs.assignment_id = ha.id AND hs.student_id = st.id AND hs.tenant_id = $1
         WHERE ha.id = $3 AND ha.tenant_id = $1 AND ha.assigned_by = $2
           AND ${OWNED_SECTION_SQL}
         ORDER BY st.roll_number ASC NULLS LAST, st.first_name ASC`,
        [tenantId, userId, assignmentId]
    );

    return rows;
}

export interface GradeSubmissionResult {
    success: boolean;
    error?: string;
}

export async function gradeMySubmission(input: {
    submissionId: string;
    marks: string;
    feedback: string;
}): Promise<GradeSubmissionResult> {
    const { tenantId, userId } = await requireAuth('homework:write');

    if (!UUID_RE.test(input.submissionId)) {
        return { success: false, error: 'Invalid submission.' };
    }

    // Only a submission against homework THIS teacher set.
    const subRes = await pool.query(
        `SELECT hs.id, ha.max_marks AS "maxMarks"
         FROM homework_submissions hs
         INNER JOIN homework_assignments ha ON ha.id = hs.assignment_id
         WHERE hs.id = $3 AND hs.tenant_id = $1 AND ha.tenant_id = $1 AND ha.assigned_by = $2`,
        [tenantId, userId, input.submissionId]
    );
    if (subRes.rows.length === 0) {
        return { success: false, error: 'That submission is not against homework you set.' };
    }

    let marks: number | null = null;
    if (input.marks.trim() !== '') {
        const parsed = Number(input.marks);
        if (!Number.isInteger(parsed) || parsed < 0) {
            return { success: false, error: 'Marks must be a whole number of zero or more.' };
        }
        const maxMarks = subRes.rows[0].maxMarks;
        if (maxMarks !== null && parsed > Number(maxMarks)) {
            return { success: false, error: `Marks cannot exceed ${maxMarks}.` };
        }
        marks = parsed;
    }

    await pool.query(
        `UPDATE homework_submissions
         SET marks = $1, feedback = $2, graded_by = $3, graded_at = NOW()
         WHERE id = $4 AND tenant_id = $5`,
        [marks, input.feedback.trim() || null, userId, input.submissionId, tenantId]
    );

    revalidatePath('/teacher/homework');

    return { success: true };
}
