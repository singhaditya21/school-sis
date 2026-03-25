// Quiz/Assessment Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export type QuestionType = 'mcq' | 'true_false' | 'short_answer';
export interface QuizQuestion { id: string; text: string; type: QuestionType; options?: string[]; correctAnswer: string | number; marks: number; }
export interface Quiz { id: string; title: string; subject: string; class: string; section?: string; createdBy: string; duration: number; totalMarks: number; questions: QuizQuestion[]; status: 'draft' | 'published' | 'closed'; startTime?: string; endTime?: string; createdAt: string; }
export interface QuizAttempt { id: string; quizId: string; studentId: string; studentName: string; answers: Record<string, string | number>; score: number; totalMarks: number; percentage: number; startedAt: string; submittedAt?: string; status: 'in_progress' | 'submitted' | 'graded'; }

export const QuizService = {
    async getQuizzes(tenantId: string, filters?: { subject?: string; class?: string; status?: string }): Promise<Quiz[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`
            SELECT q.id, q.title, sub.name AS subject, g.name AS class, sec.name AS section,
                   u.first_name || ' ' || u.last_name AS "createdBy", q.duration, q.total_marks AS "totalMarks",
                   q.questions, q.status, q.start_time AS "startTime", q.end_time AS "endTime", q.created_at AS "createdAt"
            FROM quizzes q LEFT JOIN subjects sub ON sub.id = q.subject_id LEFT JOIN grades g ON g.id = q.grade_id
            LEFT JOIN sections sec ON sec.id = q.section_id LEFT JOIN users u ON u.id = q.created_by
            WHERE q.tenant_id = ${tenantId}
            ${filters?.subject ? sql`AND sub.name = ${filters.subject}` : sql``}
            ${filters?.class ? sql`AND g.name = ${filters.class}` : sql``}
            ${filters?.status ? sql`AND q.status = ${filters.status}` : sql``}
            ORDER BY q.created_at DESC LIMIT 100`);
        return rows as Quiz[];
    },

    async getQuizById(tenantId: string, id: string): Promise<Quiz | undefined> {
        await setTenantContext(tenantId);
        const [row] = await db.execute(sql`
            SELECT q.id, q.title, sub.name AS subject, g.name AS class, sec.name AS section,
                   u.first_name || ' ' || u.last_name AS "createdBy", q.duration, q.total_marks AS "totalMarks",
                   q.questions, q.status, q.start_time AS "startTime", q.end_time AS "endTime", q.created_at AS "createdAt"
            FROM quizzes q LEFT JOIN subjects sub ON sub.id = q.subject_id LEFT JOIN grades g ON g.id = q.grade_id
            LEFT JOIN sections sec ON sec.id = q.section_id LEFT JOIN users u ON u.id = q.created_by
            WHERE q.id = ${id} AND q.tenant_id = ${tenantId}`) as any[];
        return row || undefined;
    },

    async getQuizStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='published') AS published,
            COUNT(*) FILTER (WHERE status='draft') AS draft, COUNT(*) FILTER (WHERE status='closed') AS closed
            FROM quizzes WHERE tenant_id = ${tenantId}`) as any[];
        return { total: Number(s?.total||0), published: Number(s?.published||0), draft: Number(s?.draft||0), closed: Number(s?.closed||0) };
    },

    async getQuizAttempts(tenantId: string, quizId: string): Promise<QuizAttempt[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`
            SELECT qa.id, qa.quiz_id AS "quizId", qa.student_id AS "studentId",
                   s.first_name || ' ' || s.last_name AS "studentName", qa.answers, qa.score,
                   qa.total_marks AS "totalMarks", ROUND(qa.score::numeric / NULLIF(qa.total_marks, 0) * 100) AS percentage,
                   qa.started_at AS "startedAt", qa.submitted_at AS "submittedAt", qa.status
            FROM quiz_attempts qa JOIN students s ON s.id = qa.student_id
            WHERE qa.quiz_id = ${quizId} AND qa.tenant_id = ${tenantId} ORDER BY qa.score DESC`);
        return rows as QuizAttempt[];
    },

    async getQuizAnalytics(tenantId: string, quizId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`
            SELECT COUNT(*) AS total, ROUND(AVG(score::numeric / NULLIF(total_marks, 0) * 100)) AS avg_pct,
                   MAX(score::numeric / NULLIF(total_marks, 0) * 100) AS max_pct, MIN(score::numeric / NULLIF(total_marks, 0) * 100) AS min_pct,
                   COUNT(*) FILTER (WHERE score::numeric / NULLIF(total_marks, 0) * 100 >= 40) AS passed,
                   COUNT(*) FILTER (WHERE score::numeric / NULLIF(total_marks, 0) * 100 < 40) AS failed
            FROM quiz_attempts WHERE quiz_id = ${quizId} AND tenant_id = ${tenantId} AND status = 'graded'`) as any[];
        if (!s || Number(s.total) === 0) return null;
        return { totalAttempts: Number(s.total), averageScore: Number(s.avg_pct||0), highestScore: Number(s.max_pct||0),
                 lowestScore: Number(s.min_pct||0), passed: Number(s.passed||0), failed: Number(s.failed||0) };
    },

    calculateScore(quiz: Quiz, answers: Record<string, string | number>): number {
        let score = 0;
        quiz.questions.forEach((q) => {
            const answer = answers[q.id];
            if (q.type === 'short_answer') { if (String(answer).toLowerCase().trim() === String(q.correctAnswer).toLowerCase()) score += q.marks; }
            else if (answer === q.correctAnswer) score += q.marks;
        });
        return score;
    },

    async getSubjects(tenantId: string): Promise<string[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT name FROM subjects WHERE tenant_id = ${tenantId} ORDER BY name`);
        return (rows as any[]).map(r => r.name);
    },

    async getClasses(tenantId: string): Promise<string[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT name FROM grades WHERE tenant_id = ${tenantId} ORDER BY display_order`);
        return (rows as any[]).map(r => r.name);
    },
};
