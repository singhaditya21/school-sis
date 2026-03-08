'use server';

import { db } from '@/lib/db';
import { homeworkAssignments, homeworkSubmissions, students } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Assignments ─────────────────────────────────────────

export async function getAssignments(filters?: { gradeId?: string }) {
    const { tenantId } = await requireAuth('homework:read');

    const conditions = [eq(homeworkAssignments.tenantId, tenantId)];
    if (filters?.gradeId) conditions.push(eq(homeworkAssignments.gradeId, filters.gradeId));

    return db.select().from(homeworkAssignments).where(and(...conditions)).orderBy(desc(homeworkAssignments.createdAt));
}

// ─── Create Assignment ──────────────────────────────────────

export async function createAssignment(data: {
    title: string;
    description?: string;
    subjectId?: string;
    gradeId?: string;
    sectionId?: string;
    dueDate: string;
    maxMarks?: number;
}) {
    const { tenantId, userId } = await requireAuth('homework:write');

    const [hw] = await db.insert(homeworkAssignments).values({
        tenantId,
        title: data.title,
        description: data.description,
        subjectId: data.subjectId,
        gradeId: data.gradeId,
        sectionId: data.sectionId,
        dueDate: data.dueDate,
        assignedBy: userId,
        maxMarks: data.maxMarks,
    }).returning();

    return { success: true, assignment: hw };
}

// ─── Get Submissions ─────────────────────────────────────────

export async function getSubmissions(assignmentId: string) {
    const { tenantId } = await requireAuth('homework:read');

    return db
        .select({
            id: homeworkSubmissions.id,
            studentId: homeworkSubmissions.studentId,
            studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
            submittedAt: homeworkSubmissions.submittedAt,
            content: homeworkSubmissions.content,
            marks: homeworkSubmissions.marks,
            feedback: homeworkSubmissions.feedback,
        })
        .from(homeworkSubmissions)
        .leftJoin(students, eq(homeworkSubmissions.studentId, students.id))
        .where(and(eq(homeworkSubmissions.assignmentId, assignmentId), eq(homeworkSubmissions.tenantId, tenantId)))
        .orderBy(desc(homeworkSubmissions.submittedAt));
}

// ─── Grade Submission ────────────────────────────────────────

export async function gradeSubmission(submissionId: string, marks: number, feedback?: string) {
    const { tenantId, userId } = await requireAuth('homework:write');

    await db.update(homeworkSubmissions)
        .set({ marks, feedback, gradedBy: userId, gradedAt: new Date() })
        .where(and(eq(homeworkSubmissions.id, submissionId), eq(homeworkSubmissions.tenantId, tenantId)));

    return { success: true };
}

// ─── Get Homework Stats ─────────────────────────────────────

export async function getHomeworkStats() {
    const { tenantId } = await requireAuth('homework:read');

    const [assignmentCount] = await db.select({ c: count() }).from(homeworkAssignments)
        .where(eq(homeworkAssignments.tenantId, tenantId));

    const [submissionCount] = await db.select({ c: count() }).from(homeworkSubmissions)
        .where(eq(homeworkSubmissions.tenantId, tenantId));

    const [gradedCount] = await db.select({ c: count() }).from(homeworkSubmissions)
        .where(and(eq(homeworkSubmissions.tenantId, tenantId), sql`${homeworkSubmissions.marks} IS NOT NULL`));

    return {
        totalAssignments: assignmentCount?.c || 0,
        totalSubmissions: submissionCount?.c || 0,
        gradedSubmissions: gradedCount?.c || 0,
        pendingGrading: (submissionCount?.c || 0) - (gradedCount?.c || 0),
    };
}
