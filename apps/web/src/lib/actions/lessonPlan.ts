'use server';

import { db } from '@/lib/db';
import { lessonPlans } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Lesson Plans ────────────────────────────────────────

export async function getLessonPlans(filters?: { status?: string; teacherId?: string }) {
    const { tenantId } = await requireAuth('lessonplan:read');

    const conditions = [eq(lessonPlans.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(lessonPlans.status, filters.status as any));
    if (filters?.teacherId) conditions.push(eq(lessonPlans.teacherId, filters.teacherId));

    return db.select().from(lessonPlans).where(and(...conditions)).orderBy(desc(lessonPlans.createdAt));
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

    const [lp] = await db.insert(lessonPlans).values({
        tenantId,
        topic: data.topic,
        subjectId: data.subjectId,
        gradeId: data.gradeId,
        teacherId: userId,
        objectives: data.objectives,
        activities: data.activities,
        resources: data.resources,
        assessmentPlan: data.assessmentPlan,
        duration: data.duration,
        weekNumber: data.weekNumber,
    }).returning();

    return { success: true, lessonPlan: lp };
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

    await db.update(lessonPlans)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(lessonPlans.id, planId), eq(lessonPlans.tenantId, tenantId)));

    return { success: true };
}

// ─── Approve Lesson Plan ─────────────────────────────────────

export async function approveLessonPlan(planId: string) {
    const { tenantId, userId } = await requireAuth('lessonplan:write');

    await db.update(lessonPlans)
        .set({ status: 'APPROVED', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(lessonPlans.id, planId), eq(lessonPlans.tenantId, tenantId)));

    return { success: true };
}
