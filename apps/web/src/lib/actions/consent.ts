'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function getConsentForms() {
    const { tenantId } = await requireAuth('consent:read');
    const { rows } = await pool.query(
        `SELECT id, tenant_id AS "tenantId", title, description, form_type AS "formType", audience, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt" FROM consent_forms WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId]
    );
    return rows;
}

export async function createConsentForm(data: {
    title: string; description?: string; formType: string; audience?: string; dueDate?: string;
}) {
    const { tenantId, userId } = await requireAuth('consent:write');
    const { rows } = await pool.query(
        `INSERT INTO consent_forms (tenant_id, title, description, form_type, audience, due_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, tenant_id AS "tenantId", title, description, form_type AS "formType", audience, due_date AS "dueDate", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, data.title, data.description || null, data.formType, data.audience || 'ALL', data.dueDate || null, userId]
    );
    return { success: true, form: rows[0] };
}

export async function getConsentResponses(formId: string) {
    const { tenantId } = await requireAuth('consent:read');
    const { rows } = await pool.query(
        `SELECT cr.id, cr.student_id AS "studentId", s.first_name || ' ' || s.last_name AS "studentName", cr.respondent_name AS "respondentName", cr.response, cr.responded_at AS "respondedAt" FROM consent_responses cr LEFT JOIN students s ON cr.student_id = s.id WHERE cr.form_id = $1 AND cr.tenant_id = $2`,
        [formId, tenantId]
    );
    return rows;
}

export async function getConsentStats() {
    const { tenantId } = await requireAuth('consent:read');
    
    const { rows: formCountRows } = await pool.query(
        `SELECT COUNT(*) as c FROM consent_forms WHERE tenant_id = $1`,
        [tenantId]
    );
    const { rows: responseCountRows } = await pool.query(
        `SELECT COUNT(*) as c FROM consent_responses WHERE tenant_id = $1`,
        [tenantId]
    );
    const { rows: acceptedRows } = await pool.query(
        `SELECT COUNT(*) as c FROM consent_responses WHERE tenant_id = $1 AND response = $2`,
        [tenantId, 'ACCEPTED']
    );

    const totalForms = parseInt(formCountRows[0].c, 10) || 0;
    const totalResponses = parseInt(responseCountRows[0].c, 10) || 0;
    const accepted = parseInt(acceptedRows[0].c, 10) || 0;

    return {
        totalForms,
        totalResponses,
        accepted,
        declined: totalResponses - accepted,
    };
}
