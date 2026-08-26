import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Read-side queries for the admin quiz surface.
 *
 * Every statement is tenant-scoped and parameterised. Column names are taken
 * from apps/web/drizzle/0000_init_baseline.sql — note that `quiz_questions`
 * has NO created_at / updated_at columns.
 *
 * Answer-storage convention (shared with the write actions in ./actions.ts):
 *   MCQ          → `options` holds the choices, `correct_answer` holds the
 *                  exact text of the correct choice.
 *   TRUE_FALSE   → `options` is ['True','False'], `correct_answer` is one of them.
 *   SHORT_ANSWER → `options` is empty, `correct_answer` is the expected text.
 */

export const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface QuizListRow {
    id: string;
    title: string;
    duration: number;
    totalMarks: number;
    status: string;
    createdAt: Date | string;
    startTime: Date | string | null;
    endTime: Date | string | null;
    subjectName: string | null;
    gradeName: string | null;
    sectionName: string | null;
    questionCount: number;
    attemptCount: number;
}

export interface QuizQuestionRow {
    id: string;
    text: string;
    type: string;
    options: string[];
    correctAnswer: string;
    marks: number;
    negativeMarks: number;
    section: string | null;
    ordering: number;
}

export interface QuizDetail {
    id: string;
    title: string;
    duration: number;
    totalMarks: number;
    status: string;
    instructions: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    startTime: Date | string | null;
    endTime: Date | string | null;
    subjectId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    subjectName: string | null;
    gradeName: string | null;
    sectionName: string | null;
    createdByName: string | null;
    questions: QuizQuestionRow[];
    questionMarksTotal: number;
    attemptCount: number;
}

export interface QuizAttemptRow {
    id: string;
    studentId: string;
    studentName: string | null;
    admissionNumber: string | null;
    score: number | null;
    totalMarks: number | null;
    percentage: number | null;
    percentile: number | null;
    answers: Record<string, string | number> | null;
    status: string;
    startedAt: Date | string;
    submittedAt: Date | string | null;
}

export async function getQuizStatusCounts() {
    const { tenantId } = await requireAuth('quiz:read');

    const { rows } = await pool.query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft,
            COUNT(*) FILTER (WHERE status = 'PUBLISHED')::int AS published,
            COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed
        FROM quizzes
        WHERE tenant_id = $1`,
        [tenantId]
    );

    return (rows[0] ?? { total: 0, draft: 0, published: 0, closed: 0 }) as {
        total: number;
        draft: number;
        published: number;
        closed: number;
    };
}

export async function listQuizzes(status?: string): Promise<QuizListRow[]> {
    const { tenantId } = await requireAuth('quiz:read');

    const params: string[] = [tenantId];
    let statusFilter = '';
    if (status && ['DRAFT', 'PUBLISHED', 'CLOSED'].includes(status)) {
        params.push(status);
        statusFilter = ` AND q.status = $2`;
    }

    const { rows } = await pool.query(
        `SELECT
            q.id,
            q.title,
            q.duration,
            q.total_marks AS "totalMarks",
            q.status,
            q.created_at AS "createdAt",
            q.start_time AS "startTime",
            q.end_time AS "endTime",
            sub.name AS "subjectName",
            g.name AS "gradeName",
            sec.name AS "sectionName",
            (SELECT COUNT(*)::int FROM quiz_questions qq
                WHERE qq.quiz_id = q.id AND qq.tenant_id = q.tenant_id) AS "questionCount",
            (SELECT COUNT(*)::int FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.tenant_id = q.tenant_id) AS "attemptCount"
        FROM quizzes q
        LEFT JOIN subjects sub ON sub.id = q.subject_id AND sub.tenant_id = q.tenant_id
        LEFT JOIN grades g ON g.id = q.grade_id AND g.tenant_id = q.tenant_id
        LEFT JOIN sections sec ON sec.id = q.section_id AND sec.tenant_id = q.tenant_id
        WHERE q.tenant_id = $1${statusFilter}
        ORDER BY q.created_at DESC`,
        params
    );

    return rows as QuizListRow[];
}

export async function getQuizDetail(quizId: string): Promise<QuizDetail | null> {
    const { tenantId } = await requireAuth('quiz:read');

    const { rows: quizzes } = await pool.query(
        `SELECT
            q.id,
            q.title,
            q.duration,
            q.total_marks AS "totalMarks",
            q.status,
            q.instructions,
            q.created_at AS "createdAt",
            q.updated_at AS "updatedAt",
            q.start_time AS "startTime",
            q.end_time AS "endTime",
            q.subject_id AS "subjectId",
            q.grade_id AS "gradeId",
            q.section_id AS "sectionId",
            sub.name AS "subjectName",
            g.name AS "gradeName",
            sec.name AS "sectionName",
            NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS "createdByName",
            (SELECT COUNT(*)::int FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.tenant_id = q.tenant_id) AS "attemptCount"
        FROM quizzes q
        LEFT JOIN subjects sub ON sub.id = q.subject_id AND sub.tenant_id = q.tenant_id
        LEFT JOIN grades g ON g.id = q.grade_id AND g.tenant_id = q.tenant_id
        LEFT JOIN sections sec ON sec.id = q.section_id AND sec.tenant_id = q.tenant_id
        LEFT JOIN users u ON u.id = q.created_by AND u.tenant_id = q.tenant_id
        WHERE q.id = $1 AND q.tenant_id = $2`,
        [quizId, tenantId]
    );

    if (quizzes.length === 0) return null;

    const { rows: questions } = await pool.query(
        `SELECT
            id,
            text,
            type,
            COALESCE(options, '[]'::jsonb) AS options,
            correct_answer AS "correctAnswer",
            marks,
            negative_marks AS "negativeMarks",
            section,
            ordering
        FROM quiz_questions
        WHERE quiz_id = $1 AND tenant_id = $2
        ORDER BY ordering ASC`,
        [quizId, tenantId]
    );

    const typedQuestions = questions.map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? (q.options as string[]) : [],
    })) as QuizQuestionRow[];

    return {
        ...(quizzes[0] as Omit<QuizDetail, 'questions' | 'questionMarksTotal'>),
        questions: typedQuestions,
        questionMarksTotal: typedQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0),
    };
}

export async function getQuizAttempts(quizId: string): Promise<QuizAttemptRow[]> {
    const { tenantId } = await requireAuth('quiz:read');

    const { rows } = await pool.query(
        `SELECT
            qa.id,
            qa.student_id AS "studentId",
            NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), '') AS "studentName",
            s.admission_number AS "admissionNumber",
            qa.score,
            qa.total_marks AS "totalMarks",
            qa.percentage,
            qa.percentile,
            qa.answers,
            qa.status,
            qa.started_at AS "startedAt",
            qa.submitted_at AS "submittedAt"
        FROM quiz_attempts qa
        LEFT JOIN students s ON s.id = qa.student_id AND s.tenant_id = qa.tenant_id
        WHERE qa.quiz_id = $1 AND qa.tenant_id = $2
        ORDER BY qa.percentage DESC NULLS LAST, qa.submitted_at ASC NULLS LAST`,
        [quizId, tenantId]
    );

    return rows as QuizAttemptRow[];
}

/** Subjects / grades / sections for the quiz creation dropdowns. */
export async function getQuizTargetOptions() {
    const { tenantId } = await requireAuth('quiz:read');

    const [subjects, grades, sections] = await Promise.all([
        pool.query(
            `SELECT id, name, code FROM subjects WHERE tenant_id = $1 ORDER BY name ASC`,
            [tenantId]
        ),
        pool.query(
            `SELECT id, name FROM grades WHERE tenant_id = $1 ORDER BY display_order ASC, name ASC`,
            [tenantId]
        ),
        pool.query(
            `SELECT
                sec.id,
                sec.name,
                g.name AS "gradeName"
            FROM sections sec
            LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = sec.tenant_id
            WHERE sec.tenant_id = $1
            ORDER BY g.display_order ASC NULLS LAST, sec.name ASC`,
            [tenantId]
        ),
    ]);

    return {
        subjects: subjects.rows as { id: string; name: string; code: string }[],
        grades: grades.rows as { id: string; name: string }[],
        sections: sections.rows as { id: string; name: string; gradeName: string | null }[],
    };
}
