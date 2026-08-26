'use server';

/**
 * Marks verification.
 *
 * "Verified" in this schema means a row in `exam_result_hashes` pointing at a
 * `student_results` row — a sha256 of the result payload, written by
 * verifyExamResults() in lib/actions/exams.ts. There is no rejection ledger:
 * rejecting deletes the result so it has to be re-entered. Both facts are
 * surfaced literally on the page rather than dressed up as a workflow that
 * does not exist.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { verifyExamResults, rejectExamResults } from '@/lib/actions/exams';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}

export interface PendingResultRow {
    resultId: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    subjectName: string;
    examId: string;
    examName: string;
    marksObtained: number | null;
    maxMarks: number;
    passingMarks: number;
    grade: string | null;
    isAbsent: boolean;
    enteredBy: string | null;
    enteredAt: string | null;
}

export interface VerificationExamOption {
    id: string;
    name: string;
    pendingCount: number;
}

export interface VerificationOverview {
    stats: {
        pending: number;
        verified: number;
        total: number;
    };
    exams: VerificationExamOption[];
    rows: PendingResultRow[];
    truncated: boolean;
}

const ROW_LIMIT = 200;

export async function getVerificationOverview(
    examId?: string,
): Promise<VerificationOverview> {
    const { tenantId } = await requireAuth('exams:read');
    const filterExamId = isUuid(examId) ? examId : null;

    const statsRes = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(erh.id)::int AS verified
         FROM student_results sr
         LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1`,
        [tenantId],
    );
    const total = Number(statsRes.rows[0]?.total ?? 0);
    const verified = Number(statsRes.rows[0]?.verified ?? 0);

    const examsRes = await pool.query(
        `SELECT e.id, e.name, COUNT(sr.id)::int AS "pendingCount"
         FROM exams e
         INNER JOIN exam_schedules es ON es.exam_id = e.id
         INNER JOIN student_results sr ON sr.exam_schedule_id = es.id AND sr.tenant_id = e.tenant_id
         LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
         WHERE e.tenant_id = $1 AND erh.id IS NULL
         GROUP BY e.id, e.name, e.start_date
         ORDER BY e.start_date DESC`,
        [tenantId],
    );

    const rowsRes = await pool.query(
        `SELECT sr.id               AS "resultId",
                st.first_name || ' ' || st.last_name AS "studentName",
                st.admission_number AS "admissionNumber",
                g.name || COALESCE('-' || sec.name, '') AS "className",
                sub.name            AS "subjectName",
                e.id                AS "examId",
                e.name              AS "examName",
                sr.marks_obtained   AS "marksObtained",
                es.max_marks        AS "maxMarks",
                es.passing_marks    AS "passingMarks",
                sr.grade,
                sr.is_absent        AS "isAbsent",
                u.first_name || ' ' || u.last_name AS "enteredBy",
                sr.created_at       AS "enteredAt"
         FROM student_results sr
         INNER JOIN students st ON sr.student_id = st.id AND st.tenant_id = sr.tenant_id
         INNER JOIN exam_schedules es ON sr.exam_schedule_id = es.id
         INNER JOIN exams e ON es.exam_id = e.id AND e.tenant_id = sr.tenant_id
         INNER JOIN subjects sub ON es.subject_id = sub.id AND sub.tenant_id = sr.tenant_id
         INNER JOIN grades g ON es.grade_id = g.id AND g.tenant_id = sr.tenant_id
         LEFT JOIN sections sec ON st.section_id = sec.id AND sec.tenant_id = sr.tenant_id
         LEFT JOIN users u ON sr.entered_by = u.id AND u.tenant_id = sr.tenant_id
         LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1
           AND erh.id IS NULL
           AND ($2::uuid IS NULL OR e.id = $2::uuid)
         ORDER BY sr.created_at ASC, st.first_name ASC
         LIMIT ${ROW_LIMIT + 1}`,
        [tenantId, filterExamId],
    );

    const rows: PendingResultRow[] = rowsRes.rows.slice(0, ROW_LIMIT).map((r) => ({
        resultId: r.resultId,
        studentName: r.studentName,
        admissionNumber: r.admissionNumber,
        className: r.className,
        subjectName: r.subjectName,
        examId: r.examId,
        examName: r.examName,
        marksObtained: r.marksObtained === null ? null : Number(r.marksObtained),
        maxMarks: Number(r.maxMarks),
        passingMarks: Number(r.passingMarks),
        grade: r.grade,
        isAbsent: Boolean(r.isAbsent),
        enteredBy: r.enteredBy,
        enteredAt: r.enteredAt ? new Date(r.enteredAt).toISOString().slice(0, 10) : null,
    }));

    return {
        stats: { pending: total - verified, verified, total },
        exams: examsRes.rows.map((r) => ({
            id: r.id,
            name: r.name,
            pendingCount: Number(r.pendingCount),
        })),
        rows,
        truncated: rowsRes.rows.length > ROW_LIMIT,
    };
}

export interface VerificationActionResult {
    success: boolean;
    error?: string;
    affected: number;
}

/** Locks the given results by writing their hash. Already-locked ids are ignored. */
export async function lockResults(resultIds: string[]): Promise<VerificationActionResult> {
    try {
        const { tenantId } = await requireAuth('exams:write');

        const ids = (resultIds ?? []).filter(isUuid);
        if (ids.length === 0) {
            return { success: false, error: 'Nothing selected.', affected: 0 };
        }

        const { rows } = await pool.query(
            `SELECT sr.id
             FROM student_results sr
             LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
             WHERE sr.tenant_id = $1 AND sr.id = ANY($2::uuid[]) AND erh.id IS NULL`,
            [tenantId, ids],
        );
        const unlocked = rows.map((r) => r.id);

        if (unlocked.length === 0) {
            return { success: false, error: 'Those results are already verified.', affected: 0 };
        }

        await verifyExamResults(unlocked);
        return { success: true, affected: unlocked.length };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to verify results.';
        return { success: false, error: message, affected: 0 };
    }
}

/**
 * Rejection deletes the result rows so the teacher has to re-enter them.
 * Locked (already verified) results are never deleted.
 */
export async function discardResults(resultIds: string[]): Promise<VerificationActionResult> {
    try {
        const { tenantId } = await requireAuth('exams:write');

        const ids = (resultIds ?? []).filter(isUuid);
        if (ids.length === 0) {
            return { success: false, error: 'Nothing selected.', affected: 0 };
        }

        const { rows } = await pool.query(
            `SELECT sr.id
             FROM student_results sr
             LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
             WHERE sr.tenant_id = $1 AND sr.id = ANY($2::uuid[]) AND erh.id IS NULL`,
            [tenantId, ids],
        );
        const deletable = rows.map((r) => r.id);

        if (deletable.length === 0) {
            return {
                success: false,
                error: 'Those results are verified and locked; they cannot be sent back.',
                affected: 0,
            };
        }

        await rejectExamResults(deletable);
        return { success: true, affected: deletable.length };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send results back.';
        return { success: false, error: message, affected: 0 };
    }
}
