'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Quizzes ─────────────────────────────────────────────

export async function getQuizzes(filters?: { status?: string }) {
    const { tenantId } = await requireAuth('quiz:read');

    let query = `
        SELECT 
            id,
            tenant_id AS "tenantId",
            title,
            subject_id AS "subjectId",
            grade_id AS "gradeId",
            section_id AS "sectionId",
            created_by AS "createdBy",
            duration,
            total_marks AS "totalMarks",
            instructions,
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM quizzes 
        WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (filters?.status) {
        query += ` AND status = $2`;
        params.push(filters.status);
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
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

    const { rows } = await pool.query(
        `INSERT INTO quizzes (
            tenant_id, title, subject_id, grade_id, section_id, 
            created_by, duration, total_marks, instructions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING 
            id, tenant_id AS "tenantId", title, subject_id AS "subjectId", 
            grade_id AS "gradeId", section_id AS "sectionId", created_by AS "createdBy", 
            duration, total_marks AS "totalMarks", instructions, status, 
            created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
            tenantId, data.title, data.subjectId || null, data.gradeId || null, 
            data.sectionId || null, userId, data.duration, data.totalMarks, data.instructions || null
        ]
    );

    return { success: true, quiz: rows[0] };
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

    const { rows: maxRows } = await pool.query(
        `SELECT COALESCE(MAX(ordering), 0) AS m FROM quiz_questions WHERE quiz_id = $1`,
        [quizId]
    );
    const maxOrder = maxRows[0]?.m || 0;

    const { rows } = await pool.query(
        `INSERT INTO quiz_questions (
            tenant_id, quiz_id, text, type, options, correct_answer, marks, ordering
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING 
            id, tenant_id AS "tenantId", quiz_id AS "quizId", text, type, 
            options, correct_answer AS "correctAnswer", marks, ordering, 
            created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
            tenantId, quizId, data.text, data.type, 
            data.options ? JSON.stringify(data.options) : '[]', 
            data.correctAnswer, data.marks, maxOrder + 1
        ]
    );

    return { success: true, question: rows[0] };
}

// ─── Get Quiz By ID ──────────────────────────────────────────

export async function getQuizById(quizId: string) {
    const { tenantId } = await requireAuth('quiz:read');

    const { rows: quizzes } = await pool.query(
        `SELECT 
            id, tenant_id AS "tenantId", title, subject_id AS "subjectId", 
            grade_id AS "gradeId", section_id AS "sectionId", created_by AS "createdBy", 
            duration, total_marks AS "totalMarks", instructions, status, 
            created_at AS "createdAt", updated_at AS "updatedAt"
        FROM quizzes 
        WHERE id = $1 AND tenant_id = $2`,
        [quizId, tenantId]
    );

    if (quizzes.length === 0) return null;

    const { rows: questions } = await pool.query(
        `SELECT 
            id, tenant_id AS "tenantId", quiz_id AS "quizId", text, type, 
            options, correct_answer AS "correctAnswer", marks, ordering, 
            created_at AS "createdAt", updated_at AS "updatedAt"
        FROM quiz_questions 
        WHERE quiz_id = $1 
        ORDER BY ordering ASC`,
        [quizId]
    );

    return { ...quizzes[0], questions };
}

// ─── Publish Quiz ────────────────────────────────────────────

export async function publishQuiz(quizId: string) {
    const { tenantId } = await requireAuth('quiz:write');

    await pool.query(
        `UPDATE quizzes SET status = 'PUBLISHED', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [quizId, tenantId]
    );

    return { success: true };
}

// ─── Submit Attempt ──────────────────────────────────────────

export async function submitAttempt(quizId: string, studentId: string, answers: Record<string, string | number>) {
    const { tenantId } = await requireAuth('quiz:write');

    const { rows: questions } = await pool.query(
        `SELECT id, type, correct_answer AS "correctAnswer", marks FROM quiz_questions WHERE quiz_id = $1`,
        [quizId]
    );
    
    const { rows: quizzes } = await pool.query(
        `SELECT total_marks AS "totalMarks" FROM quizzes WHERE id = $1`,
        [quizId]
    );

    let score = 0;
    for (const q of questions) {
        const answer = answers[q.id];
        if (q.type === 'SHORT_ANSWER') {
            if (String(answer).toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()) score += q.marks;
        } else {
            if (String(answer) === q.correctAnswer) score += q.marks;
        }
    }

    let totalMarks = quizzes[0]?.totalMarks;
    if (!totalMarks) {
        totalMarks = questions.reduce((s: number, q: any) => s + q.marks, 0);
    }
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

    const { rows: attempts } = await pool.query(
        `INSERT INTO quiz_attempts (
            tenant_id, quiz_id, student_id, answers, score, total_marks, percentage, submitted_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'GRADED') 
        RETURNING 
            id, tenant_id AS "tenantId", quiz_id AS "quizId", student_id AS "studentId", 
            answers, score, total_marks AS "totalMarks", percentage, 
            submitted_at AS "submittedAt", status`,
        [tenantId, quizId, studentId, JSON.stringify(answers), score, totalMarks, percentage]
    );

    return { success: true, attempt: attempts[0] };
}

// ─── Get Quiz Analytics ──────────────────────────────────────

export async function getQuizAnalytics(quizId: string) {
    const { tenantId } = await requireAuth('quiz:read');

    const { rows: attempts } = await pool.query(
        `SELECT percentage FROM quiz_attempts WHERE quiz_id = $1 AND tenant_id = $2`,
        [quizId, tenantId]
    );

    if (attempts.length === 0) return { totalAttempts: 0, averageScore: 0, highestScore: 0, lowestScore: 0, passed: 0, failed: 0 };

    const percentages = attempts.map(a => Number(a.percentage) || 0);

    return {
        totalAttempts: attempts.length,
        averageScore: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
        highestScore: Math.max(...percentages),
        lowestScore: Math.min(...percentages),
        passed: attempts.filter(a => a >= 40).length,
        failed: attempts.filter(a => a < 40).length,
    };
}

// ─── Get Quiz Stats ──────────────────────────────────────────

export async function getQuizStats() {
    const { tenantId } = await requireAuth('quiz:read');

    const { rows: all } = await pool.query(
        `SELECT status FROM quizzes WHERE tenant_id = $1`,
        [tenantId]
    );

    return {
        total: all.length,
        published: all.filter(q => q.status === 'PUBLISHED').length,
        draft: all.filter(q => q.status === 'DRAFT').length,
        closed: all.filter(q => q.status === 'CLOSED').length,
    };
}
