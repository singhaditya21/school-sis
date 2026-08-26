'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import {
    LESSON_PLAN_STATUSES,
    type LessonPlanOptions,
    type LessonPlanRow,
    type LessonPlanStats,
    type LessonPlanStatus,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transitions the board actually offers; anything else is rejected server-side. */
const ALLOWED_TRANSITIONS: Record<LessonPlanStatus, LessonPlanStatus[]> = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['APPROVED', 'DRAFT'],
    APPROVED: ['COMPLETED', 'DRAFT'],
    COMPLETED: ['APPROVED'],
};

function toUuidOrNull(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return UUID_RE.test(trimmed) ? trimmed : null;
}

function isStatus(value: string | undefined | null): value is LessonPlanStatus {
    return Boolean(value) && (LESSON_PLAN_STATUSES as readonly string[]).includes(value as string);
}

function parseOptionalInt(
    value: number | string | null | undefined,
    min: number,
    max: number
): { ok: true; value: number | null } | { ok: false } {
    if (value === undefined || value === null || value === '') return { ok: true, value: null };
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) return { ok: false };
    return { ok: true, value: parsed };
}

export async function listLessonPlans(filters?: {
    status?: string;
    teacherId?: string;
    gradeId?: string;
    subjectId?: string;
}): Promise<LessonPlanRow[]> {
    const { tenantId } = await requireAuth('lessonplan:read');

    const params: (string | null)[] = [tenantId];
    let sql = `
        SELECT
            lp.id,
            lp.topic,
            lp.objectives,
            lp.activities,
            lp.resources,
            lp.assessment_plan AS "assessmentPlan",
            lp.duration,
            lp.week_number AS "weekNumber",
            lp.status,
            lp.subject_id AS "subjectId",
            lp.grade_id AS "gradeId",
            lp.teacher_id AS "teacherId",
            sub.name AS "subjectName",
            g.name AS "gradeName",
            NULLIF(TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.last_name, '')), '') AS "teacherName",
            NULLIF(TRIM(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '')), '') AS "approvedByName",
            lp.approved_at AS "approvedAt",
            lp.completed_at AS "completedAt",
            lp.created_at AS "createdAt",
            lp.updated_at AS "updatedAt"
        FROM lesson_plans lp
        LEFT JOIN subjects sub ON sub.id = lp.subject_id AND sub.tenant_id = lp.tenant_id
        LEFT JOIN grades g ON g.id = lp.grade_id AND g.tenant_id = lp.tenant_id
        LEFT JOIN users t ON t.id = lp.teacher_id AND t.tenant_id = lp.tenant_id
        LEFT JOIN users a ON a.id = lp.approved_by AND a.tenant_id = lp.tenant_id
        WHERE lp.tenant_id = $1
    `;

    if (isStatus(filters?.status)) {
        params.push(filters.status);
        sql += ` AND lp.status = $${params.length}::lesson_plan_status`;
    }

    const teacherId = toUuidOrNull(filters?.teacherId);
    if (teacherId) {
        params.push(teacherId);
        sql += ` AND lp.teacher_id = $${params.length}`;
    }

    const gradeId = toUuidOrNull(filters?.gradeId);
    if (gradeId) {
        params.push(gradeId);
        sql += ` AND lp.grade_id = $${params.length}`;
    }

    const subjectId = toUuidOrNull(filters?.subjectId);
    if (subjectId) {
        params.push(subjectId);
        sql += ` AND lp.subject_id = $${params.length}`;
    }

    sql += ` ORDER BY lp.week_number NULLS LAST, lp.created_at DESC LIMIT 200`;

    const { rows } = await pool.query(sql, params);
    return rows as LessonPlanRow[];
}

export async function getLessonPlanStats(): Promise<LessonPlanStats> {
    const { tenantId } = await requireAuth('lessonplan:read');

    const { rows } = await pool.query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft,
            COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
            COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
         FROM lesson_plans WHERE tenant_id = $1`,
        [tenantId]
    );

    const row = rows[0] ?? {};
    return {
        total: Number(row.total ?? 0),
        draft: Number(row.draft ?? 0),
        submitted: Number(row.submitted ?? 0),
        approved: Number(row.approved ?? 0),
        completed: Number(row.completed ?? 0),
    };
}

export async function getLessonPlanOptions(): Promise<LessonPlanOptions> {
    const { tenantId } = await requireAuth('lessonplan:read');

    const [gradeResult, subjectResult, teacherResult] = await Promise.all([
        pool.query(
            `SELECT id AS "gradeId", name AS "gradeName" FROM grades WHERE tenant_id = $1 ORDER BY display_order, name`,
            [tenantId]
        ),
        pool.query(
            `SELECT id AS "subjectId", name AS "subjectName" FROM subjects WHERE tenant_id = $1 ORDER BY name`,
            [tenantId]
        ),
        pool.query(
            `SELECT id AS "teacherId",
                    NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '') AS "teacherName"
             FROM users
             WHERE tenant_id = $1 AND is_active = true AND role IN ('TEACHER', 'PRINCIPAL', 'SCHOOL_ADMIN')
             ORDER BY first_name, last_name`,
            [tenantId]
        ),
    ]);

    return {
        grades: gradeResult.rows.map((r) => ({ gradeId: r.gradeId, gradeName: r.gradeName })),
        subjects: subjectResult.rows.map((r) => ({ subjectId: r.subjectId, subjectName: r.subjectName })),
        teachers: teacherResult.rows
            .filter((r) => r.teacherName)
            .map((r) => ({ teacherId: r.teacherId, teacherName: r.teacherName })),
    };
}

export async function saveLessonPlan(input: {
    planId?: string;
    topic: string;
    subjectId?: string;
    gradeId?: string;
    teacherId?: string;
    objectives?: string;
    activities?: string;
    resources?: string;
    assessmentPlan?: string;
    duration?: number | string | null;
    weekNumber?: number | string | null;
}): Promise<{ success: boolean; error?: string; planId?: string }> {
    const { tenantId, userId } = await requireAuth('lessonplan:write');

    const topic = input.topic?.trim();
    if (!topic) return { success: false, error: 'Topic is required.' };
    if (topic.length > 255) return { success: false, error: 'Topic must be 255 characters or fewer.' };

    const duration = parseOptionalInt(input.duration, 1, 600);
    if (!duration.ok) return { success: false, error: 'Duration must be between 1 and 600 minutes.' };

    const weekNumber = parseOptionalInt(input.weekNumber, 1, 53);
    if (!weekNumber.ok) return { success: false, error: 'Week number must be between 1 and 53.' };

    const gradeId = toUuidOrNull(input.gradeId);
    const subjectId = toUuidOrNull(input.subjectId);
    const teacherId = toUuidOrNull(input.teacherId) ?? userId;

    if (gradeId) {
        const { rowCount } = await pool.query('SELECT 1 FROM grades WHERE id = $1 AND tenant_id = $2', [gradeId, tenantId]);
        if (!rowCount) return { success: false, error: 'Selected class was not found.' };
    }
    if (subjectId) {
        const { rowCount } = await pool.query('SELECT 1 FROM subjects WHERE id = $1 AND tenant_id = $2', [subjectId, tenantId]);
        if (!rowCount) return { success: false, error: 'Selected subject was not found.' };
    }
    const teacherCheck = await pool.query('SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2', [teacherId, tenantId]);
    if (!teacherCheck.rowCount) return { success: false, error: 'Selected teacher was not found.' };

    const values = [
        topic,
        subjectId,
        gradeId,
        teacherId,
        input.objectives?.trim() || null,
        input.activities?.trim() || null,
        input.resources?.trim() || null,
        input.assessmentPlan?.trim() || null,
        duration.value,
        weekNumber.value,
    ];

    const planId = toUuidOrNull(input.planId);
    if (planId) {
        const { rowCount } = await pool.query(
            `UPDATE lesson_plans
             SET topic = $1, subject_id = $2, grade_id = $3, teacher_id = $4,
                 objectives = $5, activities = $6, resources = $7, assessment_plan = $8,
                 duration = $9, week_number = $10, updated_at = NOW()
             WHERE id = $11 AND tenant_id = $12`,
            [...values, planId, tenantId]
        );
        if (!rowCount) return { success: false, error: 'Lesson plan was not found.' };
        revalidatePath('/lesson-plans');
        return { success: true, planId };
    }

    const { rows } = await pool.query(
        `INSERT INTO lesson_plans
            (tenant_id, topic, subject_id, grade_id, teacher_id, objectives, activities,
             resources, assessment_plan, duration, week_number)
         VALUES ($11, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [...values, tenantId]
    );

    revalidatePath('/lesson-plans');
    return { success: true, planId: rows[0]?.id };
}

export async function setLessonPlanStatus(
    planId: string,
    nextStatus: string
): Promise<{ success: boolean; error?: string }> {
    const { tenantId, userId } = await requireAuth('lessonplan:write');

    const id = toUuidOrNull(planId);
    if (!id) return { success: false, error: 'Invalid lesson plan.' };
    if (!isStatus(nextStatus)) return { success: false, error: 'Unknown status.' };

    const current = await pool.query(
        'SELECT status FROM lesson_plans WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
    );
    if (!current.rowCount) return { success: false, error: 'Lesson plan was not found.' };

    const currentStatus = current.rows[0].status as LessonPlanStatus;
    if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
        return { success: false, error: `A ${currentStatus.toLowerCase()} plan cannot move to ${nextStatus.toLowerCase()}.` };
    }

    // approved_by / approved_at / completed_at only ever reflect the state the row
    // is actually in, so a plan sent back to draft loses its stale approval stamp.
    await pool.query(
        `UPDATE lesson_plans
         SET status = $1::lesson_plan_status,
             approved_by = CASE WHEN $1::text = 'APPROVED' THEN $2::uuid
                                WHEN $1::text IN ('DRAFT', 'SUBMITTED') THEN NULL
                                ELSE approved_by END,
             approved_at = CASE WHEN $1::text = 'APPROVED' THEN NOW()
                                WHEN $1::text IN ('DRAFT', 'SUBMITTED') THEN NULL
                                ELSE approved_at END,
             completed_at = CASE WHEN $1::text = 'COMPLETED' THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [nextStatus, userId, id, tenantId]
    );

    revalidatePath('/lesson-plans');
    return { success: true };
}

export async function deleteLessonPlan(planId: string): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('lessonplan:write');

    const id = toUuidOrNull(planId);
    if (!id) return { success: false, error: 'Invalid lesson plan.' };

    const { rowCount } = await pool.query(
        'DELETE FROM lesson_plans WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
    );
    if (!rowCount) return { success: false, error: 'Lesson plan was not found.' };

    revalidatePath('/lesson-plans');
    return { success: true };
}
