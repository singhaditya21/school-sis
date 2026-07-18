'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Lesson Plans ────────────────────────────────────────

export async function getLessonPlans(filters?: { status?: string; teacherId?: string }) {
    const { tenantId } = await requireAuth('lessonplan:read');

    let query = `
        SELECT 
            id,
            tenant_id AS "tenantId",
            topic,
            subject_id AS "subjectId",
            grade_id AS "gradeId",
            teacher_id AS "teacherId",
            objectives,
            activities,
            resources,
            assessment_plan AS "assessmentPlan",
            duration,
            week_number AS "weekNumber",
            status,
            approved_by AS "approvedBy",
            approved_at AS "approvedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM lesson_plans 
        WHERE tenant_id = $1
    `;
    const params: string[] = [tenantId];
    let paramIndex = 2;

    if (filters?.status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(filters.status);
    }
    if (filters?.teacherId) {
        query += ` AND teacher_id = $${paramIndex++}`;
        params.push(filters.teacherId);
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Create Lesson Plan ─────────────────────────────────────

export async function createLessonPlan(data: {
    topic: string;
    subjectId?: string;
    gradeId?: string;
    objectives?: string;
    activities?: string;
    resources?: string;
    assessmentPlan?: string;
    duration?: number;
    weekNumber?: number;
}) {
    const { tenantId, userId } = await requireAuth('lessonplan:write');

    const query = `
        INSERT INTO lesson_plans (
            tenant_id, topic, subject_id, grade_id, teacher_id,
            objectives, activities, resources, assessment_plan, duration, week_number
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) RETURNING 
            id,
            tenant_id AS "tenantId",
            topic,
            subject_id AS "subjectId",
            grade_id AS "gradeId",
            teacher_id AS "teacherId",
            objectives,
            activities,
            resources,
            assessment_plan AS "assessmentPlan",
            duration,
            week_number AS "weekNumber",
            status,
            approved_by AS "approvedBy",
            approved_at AS "approvedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
    `;
    const params = [
        tenantId, data.topic, data.subjectId || null, data.gradeId || null, userId,
        data.objectives || null, data.activities || null, data.resources || null, 
        data.assessmentPlan || null, data.duration || null, data.weekNumber || null
    ];

    const { rows } = await pool.query(query, params);

    return { success: true, lessonPlan: rows[0] };
}

// ─── Update Lesson Plan ─────────────────────────────────────

export async function updateLessonPlan(planId: string, data: Partial<{
    topic: string;
    objectives: string;
    activities: string;
    resources: string;
    assessmentPlan: string;
    duration: number;
    weekNumber: number;
}>) {
    const { tenantId } = await requireAuth('lessonplan:write');

    const setClauses: string[] = [];
    const params: (string | number)[] = [planId, tenantId];
    let paramIndex = 3;

    if (data.topic !== undefined) {
        setClauses.push(`topic = $${paramIndex++}`);
        params.push(data.topic);
    }
    if (data.objectives !== undefined) {
        setClauses.push(`objectives = $${paramIndex++}`);
        params.push(data.objectives);
    }
    if (data.activities !== undefined) {
        setClauses.push(`activities = $${paramIndex++}`);
        params.push(data.activities);
    }
    if (data.resources !== undefined) {
        setClauses.push(`resources = $${paramIndex++}`);
        params.push(data.resources);
    }
    if (data.assessmentPlan !== undefined) {
        setClauses.push(`assessment_plan = $${paramIndex++}`);
        params.push(data.assessmentPlan);
    }
    if (data.duration !== undefined) {
        setClauses.push(`duration = $${paramIndex++}`);
        params.push(data.duration);
    }
    if (data.weekNumber !== undefined) {
        setClauses.push(`week_number = $${paramIndex++}`);
        params.push(data.weekNumber);
    }

    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length > 1) { // >1 because updated_at is there
        const query = `
            UPDATE lesson_plans
            SET ${setClauses.join(', ')}
            WHERE id = $1 AND tenant_id = $2
        `;
        await pool.query(query, params);
    }

    return { success: true };
}

// ─── Approve Lesson Plan ─────────────────────────────────────

export async function approveLessonPlan(planId: string) {
    const { tenantId, userId } = await requireAuth('lessonplan:write');

    const query = `
        UPDATE lesson_plans
        SET status = 'APPROVED', approved_by = $3, approved_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
    `;
    await pool.query(query, [planId, tenantId, userId]);

    return { success: true };
}
