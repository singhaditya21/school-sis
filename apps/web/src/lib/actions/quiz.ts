'use server';

import { db } from '@/lib/db';
import { quizzes, quizQuestions, quizAttempts, students } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Quizzes ─────────────────────────────────────────────

export async function getQuizzes(filters?: { status?: string }) {
    const { tenantId } = await requireAuth('quiz:read');

    const conditions = [eq(quizzes.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(quizzes.status, filters.status as any));

    return db.select().from(quizzes).where(and(...conditions)).orderBy(desc(quizzes.createdAt));
}

// ─── Create Quiz ─────────────────────────────────────────────

export async function createQuiz(data: {
    title: string;
    subjectId?: string;
    gradeId?: string;
    sectionId?: string;
    duration: number;
    totalMarks: number;
    instructions?: string;
}) {
    const { tenantId, userId } = await requireAuth('quiz:write');

    const [quiz] = await db.insert(quizzes).values({
        tenantId,
        title: data.title,
        subjectId: data.subjectId,
        gradeId: data.gradeId,
        sectionId: data.sectionId,
        createdBy: userId,
        duration: data.duration,
        totalMarks: data.totalMarks,
        instructions: data.instructions,
    }).returning();

    return { success: true, quiz };
}

// ─── Add Question ────────────────────────────────────────────

export async function addQuestion(quizId: string, data: {
    text: string;
    type: string;
    options?: string[];
    correctAnswer: string;
    marks: number;
}) {
    const { tenantId } = await requireAuth('quiz:write');

    const [maxOrder] = await db.select({ m: sql<number>`COALESCE(MAX(${quizQuestions.ordering}), 0)` })
        .from(quizQuestions).where(eq(quizQuestions.quizId, quizId));

    const [q] = await db.insert(quizQuestions).values({
        tenantId,
        quizId,
        text: data.text,
        type: data.type as any,
        options: data.options || [],
        correctAnswer: data.correctAnswer,
        marks: data.marks,
        ordering: (maxOrder?.m || 0) + 1,
    }).returning();

    return { success: true, question: q };
}

// ─── Get Quiz By ID ──────────────────────────────────────────

export async function getQuizById(quizId: string) {
    const { tenantId } = await requireAuth('quiz:read');

    const [quiz] = await db.select().from(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.tenantId, tenantId)));

    if (!quiz) return null;

    const questions = await db.select().from(quizQuestions)
        .where(eq(quizQuestions.quizId, quizId))
        .orderBy(asc(quizQuestions.ordering));

    return { ...quiz, questions };
}

// ─── Publish Quiz ────────────────────────────────────────────

export async function publishQuiz(quizId: string) {
    const { tenantId } = await requireAuth('quiz:write');

    await db.update(quizzes)
        .set({ status: 'PUBLISHED', updatedAt: new Date() })
        .where(and(eq(quizzes.id, quizId), eq(quizzes.tenantId, tenantId)));

    return { success: true };
}

// ─── Submit Attempt ──────────────────────────────────────────

export async function submitAttempt(quizId: string, studentId: string, answers: Record<string, string | number>) {
    const { tenantId } = await requireAuth('quiz:write');

    // Get quiz questions to auto-grade
    const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId));
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId));

    let score = 0;
    for (const q of questions) {
        const answer = answers[q.id];
        if (q.type === 'SHORT_ANSWER') {
            if (String(answer).toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()) score += q.marks;
        } else {
            if (String(answer) === q.correctAnswer) score += q.marks;
        }
    }

    const totalMarks = quiz?.totalMarks || questions.reduce((s, q) => s + q.marks, 0);
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

    const [attempt] = await db.insert(quizAttempts).values({
        tenantId,
        quizId,
        studentId,
        answers,
        score,
        totalMarks,
        percentage,
        submittedAt: new Date(),
        status: 'GRADED',
    }).returning();

    return { success: true, attempt };
}

// ─── Get Quiz Analytics ──────────────────────────────────────

export async function getQuizAnalytics(quizId: string) {
    const { tenantId } = await requireAuth('quiz:read');

    const attempts = await db.select().from(quizAttempts)
        .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.tenantId, tenantId)));

    if (attempts.length === 0) return { totalAttempts: 0, averageScore: 0, highestScore: 0, lowestScore: 0, passed: 0, failed: 0 };

    const percentages = attempts.map(a => a.percentage || 0);

    return {
        totalAttempts: attempts.length,
        averageScore: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
        highestScore: Math.max(...percentages),
        lowestScore: Math.min(...percentages),
        passed: attempts.filter(a => (a.percentage || 0) >= 40).length,
        failed: attempts.filter(a => (a.percentage || 0) < 40).length,
    };
}

// ─── Get Quiz Stats ──────────────────────────────────────────

export async function getQuizStats() {
    const { tenantId } = await requireAuth('quiz:read');

    const all = await db.select().from(quizzes).where(eq(quizzes.tenantId, tenantId));

    return {
        total: all.length,
        published: all.filter(q => q.status === 'PUBLISHED').length,
        draft: all.filter(q => q.status === 'DRAFT').length,
        closed: all.filter(q => q.status === 'CLOSED').length,
    };
}
