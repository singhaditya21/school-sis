'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Write-side server actions for the admin quiz surface.
 *
 * These live beside the pages (rather than in @/lib/actions/quiz.ts) because
 * the shared module's `addQuestion` / `getQuizById` select `created_at` and
 * `updated_at` from `quiz_questions`, columns that table does not have — those
 * statements fail at runtime. The statements below use only real columns.
 *
 * Answer-storage convention (shared with ./queries.ts):
 *   MCQ          → correct_answer is the exact text of the correct option.
 *   TRUE_FALSE   → options ['True','False'], correct_answer one of them.
 *   SHORT_ANSWER → options [], correct_answer is the expected text.
 */

const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'];

function field(formData: FormData, name: string): string {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
}

function optionalId(formData: FormData, name: string): string | null {
    const value = field(formData, name);
    return value === '' ? null : value;
}

function optionalTimestamp(formData: FormData, name: string): string | null {
    const value = field(formData, name);
    if (value === '') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function back(path: string, error: string): never {
    redirect(`${path}?error=${encodeURIComponent(error)}`);
}

/** Keeps quizzes.total_marks equal to the sum of its questions' marks. */
async function syncTotalMarks(quizId: string, tenantId: string) {
    await pool.query(
        `UPDATE quizzes q
         SET total_marks = COALESCE((
                SELECT SUM(qq.marks)::int FROM quiz_questions qq
                WHERE qq.quiz_id = q.id AND qq.tenant_id = q.tenant_id
             ), 0),
             updated_at = NOW()
         WHERE q.id = $1 AND q.tenant_id = $2`,
        [quizId, tenantId]
    );
}

async function attemptCount(quizId: string, tenantId: string): Promise<number> {
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM quiz_attempts WHERE quiz_id = $1 AND tenant_id = $2`,
        [quizId, tenantId]
    );
    return Number(rows[0]?.n ?? 0);
}

// ─── Create quiz ─────────────────────────────────────────────

export async function createQuizAction(formData: FormData) {
    const { tenantId, userId } = await requireAuth('quiz:write');

    const title = field(formData, 'title');
    const duration = Number.parseInt(field(formData, 'duration'), 10);
    const startTime = optionalTimestamp(formData, 'startTime');
    const endTime = optionalTimestamp(formData, 'endTime');

    if (title === '') back('/quiz/new', 'Title is required.');
    if (!Number.isFinite(duration) || duration < 1) {
        back('/quiz/new', 'Duration must be at least 1 minute.');
    }
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
        back('/quiz/new', 'The close time must be after the open time.');
    }

    // total_marks starts at 0 and is kept in sync as questions are added.
    const { rows } = await pool.query(
        `INSERT INTO quizzes (
            tenant_id, title, subject_id, grade_id, section_id,
            created_by, duration, total_marks, instructions, start_time, end_time
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)
         RETURNING id`,
        [
            tenantId,
            title,
            optionalId(formData, 'subjectId'),
            optionalId(formData, 'gradeId'),
            optionalId(formData, 'sectionId'),
            userId,
            duration,
            optionalId(formData, 'instructions'),
            startTime,
            endTime,
        ]
    );

    revalidatePath('/quiz');
    redirect(`/quiz/${rows[0].id}`);
}

// ─── Add question ────────────────────────────────────────────

export async function addQuestionAction(formData: FormData) {
    const { tenantId } = await requireAuth('quiz:write');

    const quizId = field(formData, 'quizId');
    if (quizId === '') back('/quiz', 'Missing quiz reference.');
    const quizPath = `/quiz/${quizId}`;

    const { rows: owned } = await pool.query(
        `SELECT status FROM quizzes WHERE id = $1 AND tenant_id = $2`,
        [quizId, tenantId]
    );
    if (owned.length === 0) back('/quiz', 'Quiz not found.');

    if (await attemptCount(quizId, tenantId) > 0) {
        back(quizPath, 'This quiz already has attempts, so its questions can no longer be changed.');
    }

    const text = field(formData, 'text');
    const type = field(formData, 'type');
    const marks = Number.parseInt(field(formData, 'marks'), 10);
    const negativeMarksRaw = field(formData, 'negativeMarks');
    const negativeMarks = negativeMarksRaw === '' ? 0 : Number.parseInt(negativeMarksRaw, 10);
    const section = optionalId(formData, 'section');
    const correctAnswerInput = field(formData, 'correctAnswer');

    if (text === '') back(quizPath, 'Question text is required.');
    if (!QUESTION_TYPES.includes(type)) back(quizPath, 'Choose a valid question type.');
    if (!Number.isFinite(marks) || marks < 1) back(quizPath, 'Marks must be at least 1.');
    if (!Number.isFinite(negativeMarks) || negativeMarks < 0) {
        back(quizPath, 'Negative marks cannot be below 0.');
    }
    if (correctAnswerInput === '') back(quizPath, 'A correct answer is required.');

    let options: string[] = [];
    let correctAnswer = correctAnswerInput;

    if (type === 'MCQ') {
        options = field(formData, 'options')
            .split('\n')
            .map((o) => o.trim())
            .filter((o) => o !== '');
        if (options.length < 2) {
            back(quizPath, 'A multiple-choice question needs at least two options, one per line.');
        }
        const match = options.find(
            (o) => o.toLowerCase() === correctAnswerInput.toLowerCase()
        );
        if (!match) {
            back(quizPath, 'The correct answer must exactly match one of the options.');
        }
        correctAnswer = match;
    } else if (type === 'TRUE_FALSE') {
        options = ['True', 'False'];
        const normalised = correctAnswerInput.toLowerCase();
        if (normalised !== 'true' && normalised !== 'false') {
            back(quizPath, 'The correct answer for a true/false question must be True or False.');
        }
        correctAnswer = normalised === 'true' ? 'True' : 'False';
    }

    const { rows: orderRows } = await pool.query(
        `SELECT COALESCE(MAX(ordering), 0)::int AS m FROM quiz_questions
         WHERE quiz_id = $1 AND tenant_id = $2`,
        [quizId, tenantId]
    );

    await pool.query(
        `INSERT INTO quiz_questions (
            tenant_id, quiz_id, text, type, options, correct_answer, marks, negative_marks, section, ordering
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)`,
        [
            tenantId,
            quizId,
            text,
            type,
            JSON.stringify(options),
            correctAnswer,
            marks,
            negativeMarks,
            section,
            Number(orderRows[0]?.m ?? 0) + 1,
        ]
    );

    await syncTotalMarks(quizId, tenantId);
    revalidatePath(quizPath);
    revalidatePath('/quiz');
}

// ─── Delete question ─────────────────────────────────────────

export async function deleteQuestionAction(formData: FormData) {
    const { tenantId } = await requireAuth('quiz:write');

    const quizId = field(formData, 'quizId');
    const questionId = field(formData, 'questionId');
    if (quizId === '' || questionId === '') back('/quiz', 'Missing question reference.');
    const quizPath = `/quiz/${quizId}`;

    if (await attemptCount(quizId, tenantId) > 0) {
        back(quizPath, 'This quiz already has attempts, so its questions can no longer be changed.');
    }

    await pool.query(
        `DELETE FROM quiz_questions WHERE id = $1 AND quiz_id = $2 AND tenant_id = $3`,
        [questionId, quizId, tenantId]
    );

    await syncTotalMarks(quizId, tenantId);
    revalidatePath(quizPath);
    revalidatePath('/quiz');
}

// ─── Change status ───────────────────────────────────────────

export async function setQuizStatusAction(formData: FormData) {
    const { tenantId } = await requireAuth('quiz:write');

    const quizId = field(formData, 'quizId');
    const status = field(formData, 'status');
    if (quizId === '') back('/quiz', 'Missing quiz reference.');
    const quizPath = `/quiz/${quizId}`;

    if (!['DRAFT', 'PUBLISHED', 'CLOSED'].includes(status)) {
        back(quizPath, 'Unknown quiz status.');
    }

    if (status === 'PUBLISHED') {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM quiz_questions WHERE quiz_id = $1 AND tenant_id = $2`,
            [quizId, tenantId]
        );
        if (Number(rows[0]?.n ?? 0) === 0) {
            back(quizPath, 'Add at least one question before publishing.');
        }
    }

    if (status === 'DRAFT' && (await attemptCount(quizId, tenantId)) > 0) {
        back(quizPath, 'This quiz has attempts and cannot be returned to draft.');
    }

    await pool.query(
        `UPDATE quizzes SET status = $1::quiz_status, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [status, quizId, tenantId]
    );

    revalidatePath(quizPath);
    revalidatePath('/quiz');
}

// ─── Delete quiz ─────────────────────────────────────────────

export async function deleteQuizAction(formData: FormData) {
    const { tenantId } = await requireAuth('quiz:write');

    const quizId = field(formData, 'quizId');
    if (quizId === '') back('/quiz', 'Missing quiz reference.');

    if (await attemptCount(quizId, tenantId) > 0) {
        back(`/quiz/${quizId}`, 'This quiz has recorded attempts and cannot be deleted.');
    }

    await pool.query(`DELETE FROM quizzes WHERE id = $1 AND tenant_id = $2`, [quizId, tenantId]);

    revalidatePath('/quiz');
    redirect('/quiz');
}
