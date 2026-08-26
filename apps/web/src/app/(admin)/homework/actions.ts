'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import type {
    HomeworkAssignmentRow,
    HomeworkOptions,
    HomeworkPendingStudentRow,
    HomeworkStats,
    HomeworkSubmissionRow,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUuidOrNull(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return UUID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Assignment list with the class / subject / teacher names resolved, the live
 * submission tally, and — when the assignment is actually targeted at a class —
 * the size of the roster it was assigned to. Assignments with no grade_id get a
 * null expectedCount rather than a made-up denominator.
 */
export async function listHomeworkAssignments(filters?: {
    gradeId?: string;
    subjectId?: string;
    scope?: 'all' | 'open' | 'overdue';
}): Promise<HomeworkAssignmentRow[]> {
    const { tenantId } = await requireAuth('homework:read');

    const params: (string | null)[] = [tenantId];
    let sql = `
        SELECT
            ha.id,
            ha.title,
            ha.description,
            ha.due_date::text AS "dueDate",
            ha.max_marks AS "maxMarks",
            ha.created_at AS "createdAt",
            ha.grade_id AS "gradeId",
            ha.section_id AS "sectionId",
            ha.subject_id AS "subjectId",
            g.name AS "gradeName",
            sec.name AS "sectionName",
            sub.name AS "subjectName",
            NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS "assignedByName",
            COALESCE(sc.submission_count, 0)::int AS "submissionCount",
            COALESCE(sc.graded_count, 0)::int AS "gradedCount",
            CASE WHEN ha.grade_id IS NULL THEN NULL ELSE (
                SELECT COUNT(*)::int
                FROM students st
                WHERE st.tenant_id = ha.tenant_id
                  AND st.grade_id = ha.grade_id
                  AND (ha.section_id IS NULL OR st.section_id = ha.section_id)
                  AND st.status = 'ACTIVE'
            ) END AS "expectedCount"
        FROM homework_assignments ha
        LEFT JOIN grades g ON g.id = ha.grade_id AND g.tenant_id = ha.tenant_id
        LEFT JOIN sections sec ON sec.id = ha.section_id AND sec.tenant_id = ha.tenant_id
        LEFT JOIN subjects sub ON sub.id = ha.subject_id AND sub.tenant_id = ha.tenant_id
        LEFT JOIN users u ON u.id = ha.assigned_by AND u.tenant_id = ha.tenant_id
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS submission_count, COUNT(hs.marks) AS graded_count
            FROM homework_submissions hs
            WHERE hs.assignment_id = ha.id AND hs.tenant_id = ha.tenant_id
        ) sc ON TRUE
        WHERE ha.tenant_id = $1
    `;

    const gradeId = toUuidOrNull(filters?.gradeId);
    if (gradeId) {
        params.push(gradeId);
        sql += ` AND ha.grade_id = $${params.length}`;
    }

    const subjectId = toUuidOrNull(filters?.subjectId);
    if (subjectId) {
        params.push(subjectId);
        sql += ` AND ha.subject_id = $${params.length}`;
    }

    if (filters?.scope === 'open') {
        sql += ` AND ha.due_date >= CURRENT_DATE`;
    } else if (filters?.scope === 'overdue') {
        sql += ` AND ha.due_date < CURRENT_DATE`;
    }

    sql += ` ORDER BY ha.due_date DESC, ha.created_at DESC LIMIT 200`;

    const { rows } = await pool.query(sql, params);
    return rows as HomeworkAssignmentRow[];
}

export async function getHomeworkOverview(): Promise<HomeworkStats> {
    const { tenantId } = await requireAuth('homework:read');

    const { rows } = await pool.query(
        `SELECT
            (SELECT COUNT(*)::int FROM homework_assignments WHERE tenant_id = $1) AS "totalAssignments",
            (SELECT COUNT(*)::int FROM homework_assignments
              WHERE tenant_id = $1
                AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') AS "dueThisWeek",
            (SELECT COUNT(*)::int FROM homework_submissions WHERE tenant_id = $1) AS "totalSubmissions",
            (SELECT COUNT(*)::int FROM homework_submissions WHERE tenant_id = $1 AND marks IS NOT NULL) AS "gradedSubmissions"`,
        [tenantId]
    );

    const row = rows[0] ?? {};
    const totalSubmissions = Number(row.totalSubmissions ?? 0);
    const gradedSubmissions = Number(row.gradedSubmissions ?? 0);

    return {
        totalAssignments: Number(row.totalAssignments ?? 0),
        dueThisWeek: Number(row.dueThisWeek ?? 0),
        totalSubmissions,
        gradedSubmissions,
        pendingGrading: totalSubmissions - gradedSubmissions,
    };
}

/** Real grade / section / subject pickers — no hardcoded class lists. */
export async function getHomeworkOptions(): Promise<HomeworkOptions> {
    const { tenantId } = await requireAuth('homework:read');

    const [gradeResult, subjectResult] = await Promise.all([
        pool.query(
            `SELECT g.id AS "gradeId", g.name AS "gradeName",
                    s.id AS "sectionId", s.name AS "sectionName"
             FROM grades g
             LEFT JOIN sections s ON s.grade_id = g.id AND s.tenant_id = g.tenant_id
             WHERE g.tenant_id = $1
             ORDER BY g.display_order, g.name, s.name`,
            [tenantId]
        ),
        pool.query(
            `SELECT id AS "subjectId", name AS "subjectName", code
             FROM subjects WHERE tenant_id = $1 ORDER BY name`,
            [tenantId]
        ),
    ]);

    const grades: HomeworkOptions['grades'] = [];
    for (const row of gradeResult.rows) {
        let grade = grades.find((g) => g.gradeId === row.gradeId);
        if (!grade) {
            grade = { gradeId: row.gradeId, gradeName: row.gradeName, sections: [] };
            grades.push(grade);
        }
        if (row.sectionId) {
            grade.sections.push({ sectionId: row.sectionId, sectionName: row.sectionName });
        }
    }

    return {
        grades,
        subjects: subjectResult.rows.map((r) => ({
            subjectId: r.subjectId,
            subjectName: r.subjectName,
            code: r.code ?? null,
        })),
    };
}

export async function createHomeworkAssignment(input: {
    title: string;
    description?: string;
    gradeId?: string;
    sectionId?: string;
    subjectId?: string;
    dueDate: string;
    maxMarks?: number | null;
}): Promise<{ success: boolean; error?: string; assignmentId?: string }> {
    const { tenantId, userId } = await requireAuth('homework:write');

    const title = input.title?.trim();
    if (!title) return { success: false, error: 'Title is required.' };
    if (title.length > 255) return { success: false, error: 'Title must be 255 characters or fewer.' };

    const dueDate = input.dueDate?.trim();
    if (!dueDate || !DATE_RE.test(dueDate)) {
        return { success: false, error: 'A valid due date (YYYY-MM-DD) is required.' };
    }

    const gradeId = toUuidOrNull(input.gradeId);
    const sectionId = toUuidOrNull(input.sectionId);
    const subjectId = toUuidOrNull(input.subjectId);

    if (input.gradeId && !gradeId) return { success: false, error: 'Invalid class selected.' };
    if (input.sectionId && !sectionId) return { success: false, error: 'Invalid section selected.' };
    if (input.subjectId && !subjectId) return { success: false, error: 'Invalid subject selected.' };

    let maxMarks: number | null = null;
    if (input.maxMarks !== undefined && input.maxMarks !== null) {
        const parsed = Number(input.maxMarks);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
            return { success: false, error: 'Maximum marks must be a whole number between 0 and 1000.' };
        }
        maxMarks = parsed;
    }

    // Every referenced row must belong to this tenant; a cross-tenant id would
    // otherwise pass the FK check and silently leak.
    if (gradeId) {
        const { rowCount } = await pool.query(
            'SELECT 1 FROM grades WHERE id = $1 AND tenant_id = $2',
            [gradeId, tenantId]
        );
        if (!rowCount) return { success: false, error: 'Selected class was not found.' };
    }
    if (sectionId) {
        const { rowCount } = await pool.query(
            `SELECT 1 FROM sections WHERE id = $1 AND tenant_id = $2
             AND ($3::uuid IS NULL OR grade_id = $3::uuid)`,
            [sectionId, tenantId, gradeId]
        );
        if (!rowCount) return { success: false, error: 'Selected section does not belong to that class.' };
    }
    if (subjectId) {
        const { rowCount } = await pool.query(
            'SELECT 1 FROM subjects WHERE id = $1 AND tenant_id = $2',
            [subjectId, tenantId]
        );
        if (!rowCount) return { success: false, error: 'Selected subject was not found.' };
    }

    const { rows } = await pool.query(
        `INSERT INTO homework_assignments
            (tenant_id, title, description, subject_id, grade_id, section_id, due_date, assigned_by, max_marks)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)
         RETURNING id`,
        [
            tenantId,
            title,
            input.description?.trim() || null,
            subjectId,
            gradeId,
            sectionId,
            dueDate,
            userId,
            maxMarks,
        ]
    );

    revalidatePath('/homework');
    return { success: true, assignmentId: rows[0]?.id };
}

export async function deleteHomeworkAssignment(
    assignmentId: string
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('homework:write');

    const id = toUuidOrNull(assignmentId);
    if (!id) return { success: false, error: 'Invalid assignment.' };

    const { rowCount } = await pool.query(
        'DELETE FROM homework_assignments WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
    );
    if (!rowCount) return { success: false, error: 'Assignment was not found.' };

    revalidatePath('/homework');
    return { success: true };
}

/**
 * Submission tracker for one assignment: what came in, plus the roster students
 * who still owe work. `pending` is only meaningful when the assignment targets a
 * class, so it comes back empty (and `rosterKnown` false) when grade_id is null.
 */
export async function getAssignmentTracking(assignmentId: string): Promise<{
    success: boolean;
    error?: string;
    submissions: HomeworkSubmissionRow[];
    pending: HomeworkPendingStudentRow[];
    rosterKnown: boolean;
    maxMarks: number | null;
    title: string;
}> {
    const { tenantId } = await requireAuth('homework:read');

    const empty = {
        submissions: [] as HomeworkSubmissionRow[],
        pending: [] as HomeworkPendingStudentRow[],
        rosterKnown: false,
        maxMarks: null,
        title: '',
    };

    const id = toUuidOrNull(assignmentId);
    if (!id) return { success: false, error: 'Invalid assignment.', ...empty };

    const assignmentResult = await pool.query(
        `SELECT id, title, grade_id AS "gradeId", section_id AS "sectionId", max_marks AS "maxMarks"
         FROM homework_assignments WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) return { success: false, error: 'Assignment was not found.', ...empty };

    const submissionResult = await pool.query(
        `SELECT
            hs.id AS "submissionId",
            hs.student_id AS "studentId",
            NULLIF(TRIM(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), '') AS "studentName",
            st.roll_number AS "rollNumber",
            st.admission_number AS "admissionNumber",
            hs.submitted_at AS "submittedAt",
            hs.content,
            hs.marks,
            hs.feedback,
            hs.graded_at AS "gradedAt",
            NULLIF(TRIM(COALESCE(gu.first_name, '') || ' ' || COALESCE(gu.last_name, '')), '') AS "gradedByName"
         FROM homework_submissions hs
         LEFT JOIN students st ON st.id = hs.student_id AND st.tenant_id = hs.tenant_id
         LEFT JOIN users gu ON gu.id = hs.graded_by AND gu.tenant_id = hs.tenant_id
         WHERE hs.assignment_id = $1 AND hs.tenant_id = $2
         ORDER BY st.roll_number NULLS LAST, hs.submitted_at DESC`,
        [id, tenantId]
    );

    let pending: HomeworkPendingStudentRow[] = [];
    const rosterKnown = Boolean(assignment.gradeId);
    if (rosterKnown) {
        const pendingResult = await pool.query(
            `SELECT
                st.id AS "studentId",
                NULLIF(TRIM(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), '') AS "studentName",
                st.roll_number AS "rollNumber",
                st.admission_number AS "admissionNumber"
             FROM students st
             WHERE st.tenant_id = $1
               AND st.grade_id = $2
               AND ($3::uuid IS NULL OR st.section_id = $3::uuid)
               AND st.status = 'ACTIVE'
               AND NOT EXISTS (
                    SELECT 1 FROM homework_submissions hs
                    WHERE hs.assignment_id = $4 AND hs.student_id = st.id AND hs.tenant_id = st.tenant_id
               )
             ORDER BY st.roll_number NULLS LAST, st.first_name`,
            [tenantId, assignment.gradeId, assignment.sectionId, id]
        );
        pending = pendingResult.rows as HomeworkPendingStudentRow[];
    }

    return {
        success: true,
        submissions: submissionResult.rows as HomeworkSubmissionRow[],
        pending,
        rosterKnown,
        maxMarks: assignment.maxMarks ?? null,
        title: assignment.title,
    };
}

export async function gradeHomeworkSubmission(input: {
    submissionId: string;
    marks: number | null;
    feedback?: string;
}): Promise<{ success: boolean; error?: string }> {
    const { tenantId, userId } = await requireAuth('homework:write');

    const submissionId = toUuidOrNull(input.submissionId);
    if (!submissionId) return { success: false, error: 'Invalid submission.' };

    const existing = await pool.query(
        `SELECT ha.max_marks AS "maxMarks"
         FROM homework_submissions hs
         JOIN homework_assignments ha ON ha.id = hs.assignment_id AND ha.tenant_id = hs.tenant_id
         WHERE hs.id = $1 AND hs.tenant_id = $2`,
        [submissionId, tenantId]
    );
    if (!existing.rowCount) return { success: false, error: 'Submission was not found.' };

    let marks: number | null = null;
    if (input.marks !== null && input.marks !== undefined) {
        const parsed = Number(input.marks);
        if (!Number.isInteger(parsed) || parsed < 0) {
            return { success: false, error: 'Marks must be a whole number of zero or more.' };
        }
        const maxMarks = existing.rows[0]?.maxMarks;
        if (maxMarks !== null && maxMarks !== undefined && parsed > Number(maxMarks)) {
            return { success: false, error: `Marks cannot exceed the maximum of ${maxMarks}.` };
        }
        marks = parsed;
    }

    await pool.query(
        `UPDATE homework_submissions
         SET marks = $1,
             feedback = $2,
             graded_by = CASE WHEN $1::int IS NULL THEN NULL ELSE $3::uuid END,
             graded_at = CASE WHEN $1::int IS NULL THEN NULL ELSE NOW() END
         WHERE id = $4 AND tenant_id = $5`,
        [marks, input.feedback?.trim() || null, userId, submissionId, tenantId]
    );

    revalidatePath('/homework');
    return { success: true };
}
