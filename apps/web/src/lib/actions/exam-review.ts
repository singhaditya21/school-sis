'use server';

import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

type ReviewStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
type ReviewMutationCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'FAILED';

export type ExamReviewMutationResult =
    | { success: true; reviewed: number; unchanged: number }
    | { success: false; code: ReviewMutationCode; error: string };

export interface PendingExamResultReview {
    markId: string;
    studentName: string;
    subject: string;
    marksObtained: number | null;
    maxMarks: number;
    isAbsent: boolean;
    enteredBy: string;
    enteredAt: string;
}

export interface RejectedExamResultReview extends PendingExamResultReview {
    rejectionReason: string;
    reviewedBy: string;
    reviewedAt: string;
}

export interface ExamReviewStats {
    pending: number;
    verified: number;
    rejected: number;
}

interface LockedResultRow {
    id: string;
    studentId: string;
    examScheduleId: string;
    marksObtained: string | null;
    maxMarks: string;
    grade: string | null;
    isAbsent: boolean;
    reviewStatus: ReviewStatus;
    rejectionReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | string | null;
    examStatus: string;
    hashId: string | null;
    hashLockedBy: string | null;
    hashLockedAt: Date | string | null;
}

class ReviewMutationError extends Error {
    constructor(
        public readonly code: Exclude<ReviewMutationCode, 'FAILED'>,
        message: string,
    ) {
        super(message);
    }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 100;
const MIN_REJECTION_REASON_LENGTH = 5;
const MAX_REJECTION_REASON_LENGTH = 500;

function normalizeResultIds(resultIds: readonly string[]): string[] {
    const ids = Array.from(new Set(resultIds));
    if (ids.length === 0 || ids.length > MAX_BATCH_SIZE || ids.some(id => !UUID_PATTERN.test(id))) {
        throw new ReviewMutationError(
            'INVALID_INPUT',
            `Select between 1 and ${MAX_BATCH_SIZE} valid result records.`,
        );
    }
    return ids;
}

function normalizeRejectionReason(reason: string): string {
    const normalized = reason.trim();
    if (
        normalized.length < MIN_REJECTION_REASON_LENGTH
        || normalized.length > MAX_REJECTION_REASON_LENGTH
    ) {
        throw new ReviewMutationError(
            'INVALID_INPUT',
            `Enter a rejection reason between ${MIN_REJECTION_REASON_LENGTH} and ${MAX_REJECTION_REASON_LENGTH} characters.`,
        );
    }
    return normalized;
}

function asIso(value: Date | string | null): string | null {
    if (!value) return null;
    return new Date(value).toISOString();
}

function toDisplayResult(row: Record<string, unknown>): PendingExamResultReview {
    return {
        markId: String(row.markId),
        studentName: String(row.studentName),
        subject: String(row.subject),
        marksObtained: row.marksObtained === null ? null : Number(row.marksObtained),
        maxMarks: Number(row.maxMarks),
        isAbsent: Boolean(row.isAbsent),
        enteredBy: row.enteredBy ? String(row.enteredBy) : 'Unknown user',
        enteredAt: asIso(row.enteredAt as Date | string | null) ?? '',
    };
}

async function loadResultsForUpdate(
    client: PoolClient,
    tenantId: string,
    resultIds: readonly string[],
): Promise<LockedResultRow[]> {
    const { rows } = await client.query(
        `SELECT
            sr.id,
            sr.student_id AS "studentId",
            sr.exam_schedule_id AS "examScheduleId",
            sr.marks_obtained::text AS "marksObtained",
            es.max_marks::text AS "maxMarks",
            sr.grade,
            sr.is_absent AS "isAbsent",
            sr.review_status AS "reviewStatus",
            sr.rejection_reason AS "rejectionReason",
            sr.reviewed_by AS "reviewedBy",
            sr.reviewed_at AS "reviewedAt",
            e.status AS "examStatus",
            review_hash.id AS "hashId",
            review_hash.locked_by AS "hashLockedBy",
            review_hash.locked_at AS "hashLockedAt"
         FROM student_results sr
         INNER JOIN exam_schedules es ON es.id = sr.exam_schedule_id
         INNER JOIN exams e
            ON e.id = es.exam_id
           AND e.tenant_id = sr.tenant_id
         LEFT JOIN LATERAL (
            SELECT erh.id, erh.locked_by, erh.locked_at
            FROM exam_result_hashes erh
            WHERE erh.tenant_id = sr.tenant_id
              AND erh.result_id = sr.id
            ORDER BY erh.locked_at ASC, erh.id ASC
            LIMIT 1
         ) AS review_hash ON TRUE
         WHERE sr.tenant_id = $1
           AND sr.id = ANY($2::uuid[])
         ORDER BY e.id, sr.id
         FOR UPDATE OF e, sr`,
        [tenantId, resultIds],
    );

    if (rows.length !== resultIds.length) {
        throw new ReviewMutationError('NOT_FOUND', 'One or more exam results were not found.');
    }
    return rows as LockedResultRow[];
}

function assertReviewPhase(row: LockedResultRow): void {
    if (row.examStatus === 'PUBLISHED') {
        throw new ReviewMutationError('CONFLICT', 'Published exam results cannot be changed.');
    }
    if (row.examStatus !== 'RESULT_REVIEW') {
        throw new ReviewMutationError('CONFLICT', 'The exam is not in result review.');
    }
}

function assertResultIsComplete(row: LockedResultRow): void {
    const maximum = Number(row.maxMarks);
    if (!Number.isFinite(maximum) || maximum <= 0) {
        throw new ReviewMutationError('CONFLICT', 'The exam schedule has an invalid maximum mark value.');
    }

    if (row.isAbsent) {
        if (row.marksObtained !== null) {
            throw new ReviewMutationError('CONFLICT', 'Absent results must not contain awarded marks.');
        }
        return;
    }

    if (row.marksObtained === null) {
        throw new ReviewMutationError('CONFLICT', 'Enter marks before verifying this result.');
    }
    const awarded = Number(row.marksObtained);
    if (!Number.isFinite(awarded) || awarded < 0 || awarded > maximum) {
        throw new ReviewMutationError('CONFLICT', `Marks must be between 0 and ${row.maxMarks}.`);
    }
}

async function insertReviewAudit(
    client: PoolClient,
    input: {
        tenantId: string;
        userId: string;
        row: LockedResultRow;
        nextStatus: ReviewStatus;
        reason: string | null;
        reviewerId: string;
        reviewedAt: Date;
    },
): Promise<void> {
    await client.query(
        `INSERT INTO audit_logs (
            id, tenant_id, user_id, action, entity_type, entity_id,
            description, before_state, after_state
         ) VALUES ($1, $2, $3, 'UPDATE', 'EXAM_RESULT_REVIEW', $4, $5, $6::jsonb, $7::jsonb)`,
        [
            randomUUID(),
            input.tenantId,
            input.userId,
            input.row.id,
            input.nextStatus === 'VERIFIED'
                ? 'Exam result verified.'
                : 'Exam result rejected for correction.',
            JSON.stringify({
                status: input.row.reviewStatus,
                rejectionReason: input.row.rejectionReason,
                reviewedBy: input.row.reviewedBy,
                reviewedAt: asIso(input.row.reviewedAt),
            }),
            JSON.stringify({
                status: input.nextStatus,
                rejectionReason: input.reason,
                reviewedBy: input.reviewerId,
                reviewedAt: input.reviewedAt.toISOString(),
            }),
        ],
    );
}

function resultHash(row: LockedResultRow): string {
    const payload = JSON.stringify({
        studentId: row.studentId,
        examScheduleId: row.examScheduleId,
        marksObtained: row.marksObtained,
        grade: row.grade,
        isAbsent: row.isAbsent,
    });
    return createHash('sha256').update(payload).digest('hex');
}

function revalidateReviewPage(): void {
    try {
        revalidatePath('/exams/verification');
    } catch (error) {
        console.error('[EXAM_RESULT_REVIEW_REVALIDATE_ERROR]', error);
    }
}

export async function getPendingVerifications(): Promise<PendingExamResultReview[]> {
    const { tenantId } = await requireAuth('exams:review');
    const { rows } = await pool.query(
        `SELECT
            sr.id AS "markId",
            s.first_name || ' ' || s.last_name AS "studentName",
            sub.name AS "subject",
            sr.marks_obtained AS "marksObtained",
            es.max_marks AS "maxMarks",
            sr.is_absent AS "isAbsent",
            NULLIF(BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS "enteredBy",
            sr.created_at AS "enteredAt"
         FROM student_results sr
         INNER JOIN students s
            ON s.id = sr.student_id
           AND s.tenant_id = sr.tenant_id
         INNER JOIN exam_schedules es ON es.id = sr.exam_schedule_id
         INNER JOIN exams e
            ON e.id = es.exam_id
           AND e.tenant_id = sr.tenant_id
         INNER JOIN subjects sub ON sub.id = es.subject_id
         LEFT JOIN users u
            ON u.id = sr.entered_by
           AND u.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1
           AND sr.review_status = 'PENDING'
         ORDER BY sr.created_at ASC, sr.id ASC`,
        [tenantId],
    );
    return rows.map(toDisplayResult);
}

export async function getRecentRejectedVerifications(): Promise<RejectedExamResultReview[]> {
    const { tenantId } = await requireAuth('exams:review');
    const { rows } = await pool.query(
        `SELECT
            sr.id AS "markId",
            s.first_name || ' ' || s.last_name AS "studentName",
            sub.name AS "subject",
            sr.marks_obtained AS "marksObtained",
            es.max_marks AS "maxMarks",
            sr.is_absent AS "isAbsent",
            NULLIF(BTRIM(COALESCE(entered.first_name, '') || ' ' || COALESCE(entered.last_name, '')), '') AS "enteredBy",
            sr.created_at AS "enteredAt",
            sr.rejection_reason AS "rejectionReason",
            NULLIF(BTRIM(COALESCE(reviewer.first_name, '') || ' ' || COALESCE(reviewer.last_name, '')), '') AS "reviewedBy",
            sr.reviewed_at AS "reviewedAt"
         FROM student_results sr
         INNER JOIN students s
            ON s.id = sr.student_id
           AND s.tenant_id = sr.tenant_id
         INNER JOIN exam_schedules es ON es.id = sr.exam_schedule_id
         INNER JOIN exams e
            ON e.id = es.exam_id
           AND e.tenant_id = sr.tenant_id
         INNER JOIN subjects sub ON sub.id = es.subject_id
         LEFT JOIN users entered
            ON entered.id = sr.entered_by
           AND entered.tenant_id = sr.tenant_id
         LEFT JOIN users reviewer
            ON reviewer.id = sr.reviewed_by
           AND reviewer.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1
           AND sr.review_status = 'REJECTED'
         ORDER BY sr.reviewed_at DESC NULLS LAST, sr.id ASC
         LIMIT 25`,
        [tenantId],
    );

    return rows.map(row => ({
        ...toDisplayResult(row),
        rejectionReason: String(row.rejectionReason),
        reviewedBy: row.reviewedBy ? String(row.reviewedBy) : 'Unknown reviewer',
        reviewedAt: asIso(row.reviewedAt as Date | string | null) ?? '',
    }));
}

export async function getVerificationStats(): Promise<ExamReviewStats> {
    const { tenantId } = await requireAuth('exams:review');
    const { rows } = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE review_status = 'PENDING')::int AS pending,
            COUNT(*) FILTER (WHERE review_status = 'VERIFIED')::int AS verified,
            COUNT(*) FILTER (WHERE review_status = 'REJECTED')::int AS rejected
         FROM student_results
         WHERE tenant_id = $1`,
        [tenantId],
    );
    return {
        pending: Number(rows[0]?.pending ?? 0),
        verified: Number(rows[0]?.verified ?? 0),
        rejected: Number(rows[0]?.rejected ?? 0),
    };
}

export async function verifyExamResults(resultIds: string[]): Promise<ExamReviewMutationResult> {
    const { tenantId, userId } = await requireAuth('exams:review');
    let normalizedIds: string[];
    try {
        normalizedIds = normalizeResultIds(resultIds);
    } catch (error) {
        const reviewError = error as ReviewMutationError;
        return { success: false, code: reviewError.code, error: reviewError.message };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const rows = await loadResultsForUpdate(client, tenantId, normalizedIds);
        let reviewed = 0;
        let unchanged = 0;

        for (const row of rows) {
            if (row.reviewStatus === 'VERIFIED') {
                unchanged += 1;
                continue;
            }
            assertReviewPhase(row);
            assertResultIsComplete(row);
            if (row.reviewStatus === 'REJECTED') {
                throw new ReviewMutationError(
                    'CONFLICT',
                    'Rejected results must be corrected before they can be verified.',
                );
            }

            const reviewedAt = row.hashLockedAt ? new Date(row.hashLockedAt) : new Date();
            const reviewerId = row.hashLockedBy ?? userId;
            if (!row.hashId) {
                await client.query(
                    `INSERT INTO exam_result_hashes (
                        id, tenant_id, result_id, hash, locked_at, locked_by
                     ) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [randomUUID(), tenantId, row.id, resultHash(row), reviewedAt, userId],
                );
            }
            await client.query(
                `UPDATE student_results
                 SET review_status = 'VERIFIED',
                     rejection_reason = NULL,
                     reviewed_by = $1,
                     reviewed_at = $2,
                     updated_at = NOW()
                 WHERE id = $3
                   AND tenant_id = $4
                   AND review_status = 'PENDING'`,
                [reviewerId, reviewedAt, row.id, tenantId],
            );
            await insertReviewAudit(client, {
                tenantId,
                userId,
                row,
                nextStatus: 'VERIFIED',
                reason: null,
                reviewerId,
                reviewedAt,
            });
            reviewed += 1;
        }

        await client.query('COMMIT');
        revalidateReviewPage();
        return { success: true, reviewed, unchanged };
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof ReviewMutationError) {
            return { success: false, code: error.code, error: error.message };
        }
        console.error('[EXAM_RESULT_VERIFY_ERROR]', error);
        return { success: false, code: 'FAILED', error: 'Exam results were not verified. Please try again.' };
    } finally {
        client.release();
    }
}

export async function rejectExamResults(
    resultIds: string[],
    reason: string,
): Promise<ExamReviewMutationResult> {
    const { tenantId, userId } = await requireAuth('exams:review');
    let normalizedIds: string[];
    let normalizedReason: string;
    try {
        normalizedIds = normalizeResultIds(resultIds);
        normalizedReason = normalizeRejectionReason(reason);
    } catch (error) {
        const reviewError = error as ReviewMutationError;
        return { success: false, code: reviewError.code, error: reviewError.message };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const rows = await loadResultsForUpdate(client, tenantId, normalizedIds);
        let reviewed = 0;
        let unchanged = 0;

        for (const row of rows) {
            if (row.reviewStatus === 'REJECTED') {
                unchanged += 1;
                continue;
            }
            assertReviewPhase(row);
            if (row.reviewStatus === 'VERIFIED' || row.hashId) {
                throw new ReviewMutationError(
                    'CONFLICT',
                    'Verified results cannot be rejected. Reopen marks entry before changing them.',
                );
            }

            const reviewedAt = new Date();
            await client.query(
                `UPDATE student_results
                 SET review_status = 'REJECTED',
                     rejection_reason = $1,
                     reviewed_by = $2,
                     reviewed_at = $3,
                     updated_at = NOW()
                 WHERE id = $4
                   AND tenant_id = $5
                   AND review_status = 'PENDING'`,
                [normalizedReason, userId, reviewedAt, row.id, tenantId],
            );
            await insertReviewAudit(client, {
                tenantId,
                userId,
                row,
                nextStatus: 'REJECTED',
                reason: normalizedReason,
                reviewerId: userId,
                reviewedAt,
            });
            reviewed += 1;
        }

        await client.query('COMMIT');
        revalidateReviewPage();
        return { success: true, reviewed, unchanged };
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof ReviewMutationError) {
            return { success: false, code: error.code, error: error.message };
        }
        console.error('[EXAM_RESULT_REJECT_ERROR]', error);
        return { success: false, code: 'FAILED', error: 'Exam results were not rejected. Please try again.' };
    } finally {
        client.release();
    }
}
