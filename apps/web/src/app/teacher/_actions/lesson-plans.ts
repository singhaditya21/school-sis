'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

/**
 * Lesson plans this teacher wrote.
 *
 * `lesson_plans` is keyed on (tenant, teacher, subject, grade) — there is no
 * section, no week-by-week syllabus tree and no generated material anywhere in
 * the schema. The page therefore lists plans and lets a teacher write one; it
 * does not pretend to generate them.
 *
 * Approval is somebody else's job: `approved_by` is a separate user, so a
 * teacher here can only move a plan from DRAFT to SUBMITTED.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TeacherLessonPlan {
    id: string;
    topic: string;
    objectives: string | null;
    activities: string | null;
    resources: string | null;
    assessmentPlan: string | null;
    duration: number | null;
    weekNumber: number | null;
    status: string;
    gradeName: string | null;
    subjectName: string | null;
    approverName: string | null;
    approvedAt: string | null;
    createdAt: string;
}

export async function getMyLessonPlans(): Promise<TeacherLessonPlan[]> {
    const { tenantId, userId } = await requireAuth('lessonplan:read');

    const { rows } = await pool.query(
        `SELECT
            lp.id,
            lp.topic,
            lp.objectives,
            lp.activities,
            lp.resources,
            lp.assessment_plan AS "assessmentPlan",
            lp.duration,
            lp.week_number AS "weekNumber",
            lp.status,
            g.name AS "gradeName",
            sub.name AS "subjectName",
            CASE WHEN approver.id IS NULL THEN NULL
                 ELSE approver.first_name || ' ' || approver.last_name END AS "approverName",
            lp.approved_at::text AS "approvedAt",
            lp.created_at::text AS "createdAt"
         FROM lesson_plans lp
         LEFT JOIN grades g ON g.id = lp.grade_id
         LEFT JOIN subjects sub ON sub.id = lp.subject_id
         LEFT JOIN users approver ON approver.id = lp.approved_by AND approver.tenant_id = lp.tenant_id
         WHERE lp.tenant_id = $1 AND lp.teacher_id = $2
         ORDER BY lp.week_number ASC NULLS LAST, lp.created_at DESC`,
        [tenantId, userId]
    );

    return rows;
}

export interface LessonPlanTarget {
    gradeId: string;
    subjectId: string;
    label: string;
}

/** The (grade, subject) pairs this teacher is timetabled for. */
export async function getMyLessonPlanTargets(): Promise<LessonPlanTarget[]> {
    const { tenantId, userId } = await requireAuth('lessonplan:read');

    const { rows } = await pool.query(
        `SELECT DISTINCT
            g.id AS "gradeId",
            sub.id AS "subjectId",
            g.name || ' · ' || sub.name AS "label",
            g.display_order AS "gradeOrder"
         FROM timetable_entries te
         INNER JOIN sections sec ON sec.id = te.section_id
         INNER JOIN grades g ON g.id = sec.grade_id
         INNER JOIN subjects sub ON sub.id = te.subject_id
         WHERE te.tenant_id = $1 AND te.teacher_id = $2 AND sec.tenant_id = $1
         ORDER BY "gradeOrder" ASC, "label" ASC`,
        [tenantId, userId]
    );

    return rows.map((r) => ({ gradeId: r.gradeId, subjectId: r.subjectId, label: r.label }));
}

export interface LessonPlanResult {
    success: boolean;
    error?: string;
    planId?: string;
}

export async function createMyLessonPlan(input: {
    gradeId: string;
    subjectId: string;
    topic: string;
    objectives: string;
    activities: string;
    resources: string;
    assessmentPlan: string;
    weekNumber: string;
    duration: string;
}): Promise<LessonPlanResult> {
    const { tenantId, userId } = await requireAuth('lessonplan:write');

    const topic = input.topic.trim();
    if (!topic) return { success: false, error: 'A topic is required.' };
    if (!UUID_RE.test(input.gradeId) || !UUID_RE.test(input.subjectId)) {
        return { success: false, error: 'Pick a grade and subject you teach.' };
    }

    const parseOptionalInt = (raw: string): number | null | undefined => {
        if (raw.trim() === '') return null;
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
        return parsed;
    };

    const weekNumber = parseOptionalInt(input.weekNumber);
    if (weekNumber === undefined) return { success: false, error: 'Week must be a whole number above zero.' };
    const duration = parseOptionalInt(input.duration);
    if (duration === undefined) return { success: false, error: 'Duration must be a whole number of minutes.' };

    const targetRes = await pool.query(
        `SELECT 1
         FROM timetable_entries te
         INNER JOIN sections sec ON sec.id = te.section_id
         WHERE te.tenant_id = $1 AND te.teacher_id = $2
           AND sec.grade_id = $3 AND te.subject_id = $4
         LIMIT 1`,
        [tenantId, userId, input.gradeId, input.subjectId]
    );
    if (targetRes.rows.length === 0) {
        return { success: false, error: 'You are not timetabled for that grade and subject.' };
    }

    const { rows } = await pool.query(
        `INSERT INTO lesson_plans
            (tenant_id, subject_id, grade_id, teacher_id, topic, objectives, activities, resources, assessment_plan, duration, week_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
            tenantId,
            input.subjectId,
            input.gradeId,
            userId,
            topic,
            input.objectives.trim() || null,
            input.activities.trim() || null,
            input.resources.trim() || null,
            input.assessmentPlan.trim() || null,
            duration,
            weekNumber,
        ]
    );

    revalidatePath('/teacher/lesson-plans');

    return { success: true, planId: rows[0].id };
}

/** DRAFT -> SUBMITTED. Approving is a different role's action and is not offered here. */
export async function submitMyLessonPlan(planId: string): Promise<LessonPlanResult> {
    const { tenantId, userId } = await requireAuth('lessonplan:write');

    if (!UUID_RE.test(planId)) return { success: false, error: 'Invalid lesson plan.' };

    const { rowCount } = await pool.query(
        `UPDATE lesson_plans
         SET status = 'SUBMITTED', updated_at = NOW()
         WHERE id = $3 AND tenant_id = $1 AND teacher_id = $2 AND status = 'DRAFT'`,
        [tenantId, userId, planId]
    );

    if (!rowCount) {
        return { success: false, error: 'Only your own draft plans can be submitted.' };
    }

    revalidatePath('/teacher/lesson-plans');

    return { success: true, planId };
}
