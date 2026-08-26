'use server';

/**
 * Consent management server actions.
 *
 * These replace the reads in `lib/actions/consent.ts` for this surface, which select
 * `consent_forms.updated_at` — a column that does not exist in the schema, so every
 * call fails at runtime with 42703 — and omit `is_active`, which the page renders.
 * Everything here is checked against `apps/web/drizzle/0000_init_baseline.sql`.
 *
 * SCOPE NOTE: `consent_forms.audience` is free text with no join to a cohort, so the
 * schema cannot say how many people a form was meant to reach. This module therefore
 * reports responses received and never invents a completion percentage.
 */

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import {
    isConsentResponse,
    type ActionResult,
    type ConsentForm,
    type ConsentResponseRow,
    type ConsentStats,
    type StudentOption,
} from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function listConsentForms(): Promise<ConsentForm[]> {
    const { tenantId } = await requireAuth('consent:read');

    const { rows } = await pool.query(
        `SELECT f.id,
                f.title,
                f.description,
                f.form_type AS "formType",
                f.audience,
                to_char(f.due_date, 'YYYY-MM-DD') AS "dueDate",
                f.is_active  AS "isActive",
                f.created_at AS "createdAt",
                COALESCE(r.total, 0)::int    AS "responseCount",
                COALESCE(r.accepted, 0)::int AS "acceptedCount",
                COALESCE(r.declined, 0)::int AS "declinedCount"
           FROM consent_forms f
           LEFT JOIN LATERAL (
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE cr.response = 'ACCEPTED') AS accepted,
                       COUNT(*) FILTER (WHERE cr.response = 'DECLINED') AS declined
                  FROM consent_responses cr
                 WHERE cr.form_id = f.id
                   AND cr.tenant_id = f.tenant_id
           ) r ON TRUE
          WHERE f.tenant_id = $1
          ORDER BY f.is_active DESC, f.due_date NULLS LAST, f.created_at DESC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        formType: row.formType,
        audience: row.audience,
        dueDate: row.dueDate ?? null,
        isActive: Boolean(row.isActive),
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        responseCount: Number(row.responseCount ?? 0),
        acceptedCount: Number(row.acceptedCount ?? 0),
        declinedCount: Number(row.declinedCount ?? 0),
    }));
}

export async function getConsentSummary(): Promise<ConsentStats> {
    const { tenantId } = await requireAuth('consent:read');

    const [formRes, responseRes] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE is_active)::int AS active,
                    COUNT(*) FILTER (WHERE is_active AND due_date IS NOT NULL AND due_date < CURRENT_DATE)::int AS overdue
               FROM consent_forms
              WHERE tenant_id = $1`,
            [tenantId],
        ),
        pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE response = 'ACCEPTED')::int AS accepted,
                    COUNT(*) FILTER (WHERE response = 'DECLINED')::int AS declined
               FROM consent_responses
              WHERE tenant_id = $1`,
            [tenantId],
        ),
    ]);

    return {
        totalForms: Number(formRes.rows[0]?.total ?? 0),
        activeForms: Number(formRes.rows[0]?.active ?? 0),
        overdueForms: Number(formRes.rows[0]?.overdue ?? 0),
        totalResponses: Number(responseRes.rows[0]?.total ?? 0),
        accepted: Number(responseRes.rows[0]?.accepted ?? 0),
        declined: Number(responseRes.rows[0]?.declined ?? 0),
    };
}

export async function listFormResponses(formId: string): Promise<ConsentResponseRow[]> {
    const { tenantId } = await requireAuth('consent:read');

    const { rows } = await pool.query(
        `SELECT cr.id,
                cr.student_id AS "studentId",
                s.first_name || ' ' || s.last_name AS "studentName",
                s.admission_number AS "admissionNumber",
                COALESCE(g.name, '') || COALESCE('-' || sec.name, '') AS "className",
                cr.respondent_name AS "respondentName",
                cr.response,
                cr.responded_at AS "respondedAt",
                cr.notes
           FROM consent_responses cr
           JOIN students s ON s.id = cr.student_id AND s.tenant_id = cr.tenant_id
           LEFT JOIN grades g   ON g.id = s.grade_id   AND g.tenant_id = s.tenant_id
           LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
          WHERE cr.tenant_id = $1 AND cr.form_id = $2
          ORDER BY cr.responded_at DESC`,
        [tenantId, formId],
    );

    return rows.map((row) => ({
        id: row.id,
        studentId: row.studentId,
        studentName: row.studentName,
        admissionNumber: row.admissionNumber,
        className: row.className || '—',
        respondentName: row.respondentName ?? null,
        response: row.response,
        respondedAt: row.respondedAt ? new Date(row.respondedAt).toISOString() : '',
        notes: row.notes ?? null,
    }));
}

/** Active students, for attaching a paper reply to the right child. */
export async function listStudentOptions(search?: string): Promise<StudentOption[]> {
    const { tenantId } = await requireAuth('consent:read');

    const params: unknown[] = [tenantId];
    let filter = '';
    const needle = (search || '').trim();
    if (needle) {
        params.push(`%${needle}%`);
        filter = ` AND (s.first_name ILIKE $${params.length}
                     OR s.last_name ILIKE $${params.length}
                     OR s.admission_number ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(
        `SELECT s.id,
                s.first_name || ' ' || s.last_name AS name,
                s.admission_number AS "admissionNumber",
                COALESCE(g.name, '') || COALESCE('-' || sec.name, '') AS "className"
           FROM students s
           LEFT JOIN grades g   ON g.id = s.grade_id   AND g.tenant_id = s.tenant_id
           LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'${filter}
          ORDER BY g.display_order NULLS LAST, sec.name, s.first_name
          LIMIT 200`,
        params,
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        admissionNumber: row.admissionNumber,
        className: row.className || '—',
    }));
}

export async function createConsentForm(input: {
    title: string;
    description?: string;
    formType: string;
    audience: string;
    dueDate?: string;
}): Promise<ActionResult & { formId?: string }> {
    const { tenantId, userId } = await requireAuth('consent:write');

    const title = input.title.trim();
    const formType = input.formType.trim().toUpperCase().replace(/\s+/g, '_');
    const audience = input.audience.trim().toUpperCase() || 'ALL';

    if (!title) return { success: false, error: 'Give the form a title.' };
    if (!formType) return { success: false, error: 'Choose or type a form type.' };
    if (formType.length > 100) return { success: false, error: 'Form type is too long.' };
    if (audience.length > 50) return { success: false, error: 'Audience is too long.' };

    const dueDate = input.dueDate && ISO_DATE.test(input.dueDate) ? input.dueDate : null;

    try {
        const { rows } = await pool.query(
            `INSERT INTO consent_forms (tenant_id, title, description, form_type, audience, due_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6::date, $7)
             RETURNING id`,
            [
                tenantId,
                title,
                (input.description || '').trim() || null,
                formType,
                audience,
                dueDate,
                userId,
            ],
        );
        revalidatePath('/consent');
        return { success: true, formId: rows[0].id };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not create the form.',
        };
    }
}

export async function setConsentFormActive(
    formId: string,
    isActive: boolean,
): Promise<ActionResult> {
    const { tenantId } = await requireAuth('consent:write');

    const { rowCount } = await pool.query(
        `UPDATE consent_forms SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
        [isActive, formId, tenantId],
    );
    if (!rowCount) return { success: false, error: 'Form not found.' };

    revalidatePath('/consent');
    return { success: true };
}

/**
 * Records a reply against a form. There is no unique constraint on
 * (form_id, student_id), so an existing reply is updated rather than duplicated —
 * a school re-recording a corrected slip should not double-count.
 */
export async function recordConsentResponse(input: {
    formId: string;
    studentId: string;
    response: string;
    respondentName?: string;
    notes?: string;
}): Promise<ActionResult> {
    const { tenantId } = await requireAuth('consent:write');

    if (!isConsentResponse(input.response)) {
        return { success: false, error: 'A reply must be Accepted or Declined.' };
    }

    const formCheck = await pool.query(
        `SELECT is_active FROM consent_forms WHERE id = $1 AND tenant_id = $2`,
        [input.formId, tenantId],
    );
    if (formCheck.rowCount === 0) return { success: false, error: 'Form not found.' };
    if (!formCheck.rows[0].is_active) {
        return { success: false, error: 'This form is closed. Reactivate it to record replies.' };
    }

    const studentCheck = await pool.query(
        `SELECT 1 FROM students WHERE id = $1 AND tenant_id = $2`,
        [input.studentId, tenantId],
    );
    if (studentCheck.rowCount === 0) return { success: false, error: 'Student not found.' };

    const respondent = (input.respondentName || '').trim() || null;
    const notes = (input.notes || '').trim() || null;

    const updated = await pool.query(
        `UPDATE consent_responses
            SET response = $1, respondent_name = $2, notes = $3, responded_at = NOW()
          WHERE tenant_id = $4 AND form_id = $5 AND student_id = $6`,
        [input.response, respondent, notes, tenantId, input.formId, input.studentId],
    );

    if (updated.rowCount === 0) {
        await pool.query(
            `INSERT INTO consent_responses (tenant_id, form_id, student_id, respondent_name, response, notes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tenantId, input.formId, input.studentId, respondent, input.response, notes],
        );
    }

    revalidatePath('/consent');
    return { success: true };
}

export async function deleteConsentResponse(responseId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('consent:write');

    const { rowCount } = await pool.query(
        `DELETE FROM consent_responses WHERE id = $1 AND tenant_id = $2`,
        [responseId, tenantId],
    );
    if (!rowCount) return { success: false, error: 'Reply not found.' };

    revalidatePath('/consent');
    return { success: true };
}
