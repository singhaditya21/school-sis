'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Templates ───────────────────────────────────────────

export async function getCertificateTemplates(type?: string) {
    const { tenantId } = await requireAuth('certificate:read');

    let query = `
        SELECT 
            id, tenant_id AS "tenantId", name, type, html_template AS "htmlTemplate", 
            variables, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM certificate_templates
        WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (type) {
        params.push(type);
        query += ` AND type = $${params.length}`;
    }

    query += ` ORDER BY name ASC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Create Template ─────────────────────────────────────────

export async function createCertificateTemplate(data: {
    name: string;
    type: string;
    htmlTemplate?: string;
    variables?: string[];
}) {
    const { tenantId } = await requireAuth('certificate:write');

    const query = `
        INSERT INTO certificate_templates (tenant_id, name, type, html_template, variables)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING 
            id, tenant_id AS "tenantId", name, type, html_template AS "htmlTemplate", 
            variables, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const params = [
        tenantId,
        data.name,
        data.type,
        data.htmlTemplate || null,
        data.variables ? JSON.stringify(data.variables) : '[]'
    ];

    const { rows } = await pool.query(query, params);

    return { success: true, template: rows[0] };
}

// ─── Issue Certificate ──────────────────────────────────────

export async function issueCertificate(data: {
    templateId: string;
    studentId: string;
    certificateNumber: string;
    issuedDate: string;
    data?: Record<string, string>;
}) {
    const { tenantId, userId } = await requireAuth('certificate:write');

    const query = `
        INSERT INTO issued_certificates (
            tenant_id, template_id, student_id, certificate_number, 
            issued_date, issued_by, data, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING 
            id, tenant_id AS "tenantId", template_id AS "templateId", 
            student_id AS "studentId", certificate_number AS "certificateNumber", 
            issued_date AS "issuedDate", issued_by AS "issuedBy", 
            data, status, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const params = [
        tenantId,
        data.templateId,
        data.studentId,
        data.certificateNumber,
        data.issuedDate,
        userId,
        data.data ? JSON.stringify(data.data) : '{}',
        'ISSUED'
    ];

    const { rows } = await pool.query(query, params);

    return { success: true, certificate: rows[0] };
}

// ─── Get Issued Certificates ────────────────────────────────

export async function getIssuedCertificates(studentId?: string) {
    const { tenantId } = await requireAuth('certificate:read');

    let query = `
        SELECT 
            ic.id,
            ic.certificate_number AS "certificateNumber",
            ic.student_id AS "studentId",
            (s.first_name || ' ' || s.last_name) AS "studentName",
            ct.name AS "templateName",
            ct.type,
            ic.issued_date AS "issuedDate",
            ic.status
        FROM issued_certificates ic
        LEFT JOIN students s ON ic.student_id = s.id
        LEFT JOIN certificate_templates ct ON ic.template_id = ct.id
        WHERE ic.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (studentId) {
        params.push(studentId);
        query += ` AND ic.student_id = $${params.length}`;
    }

    query += ` ORDER BY ic.created_at DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Get Certificate Stats ──────────────────────────────────

export async function getCertificateStats() {
    const { tenantId } = await requireAuth('certificate:read');

    const templatesQuery = `SELECT COUNT(*) AS c FROM certificate_templates WHERE tenant_id = $1`;
    const templatesResult = await pool.query(templatesQuery, [tenantId]);
    const templateCount = templatesResult.rows[0];

    const issuedQuery = `SELECT COUNT(*) AS c FROM issued_certificates WHERE tenant_id = $1`;
    const issuedResult = await pool.query(issuedQuery, [tenantId]);
    const issuedCount = issuedResult.rows[0];

    const cardsQuery = `SELECT COUNT(*) AS c FROM id_cards WHERE tenant_id = $1`;
    const cardsResult = await pool.query(cardsQuery, [tenantId]);
    const cardCount = cardsResult.rows[0];

    const pendingCardsQuery = `SELECT COUNT(*) AS c FROM id_cards WHERE tenant_id = $1 AND status = 'PENDING'`;
    const pendingCardsResult = await pool.query(pendingCardsQuery, [tenantId]);
    const pendingCardsCount = pendingCardsResult.rows[0];

    return {
        templates: Number(templateCount?.c || 0),
        issued: Number(issuedCount?.c || 0),
        idCards: Number(cardCount?.c || 0),
        pendingCards: Number(pendingCardsCount?.c || 0),
    };
}

// ─── Get ID Cards ───────────────────────────────────────────

export async function getIDCards(personType?: string) {
    const { tenantId } = await requireAuth('certificate:read');

    let query = `
        SELECT 
            ic.id,
            ic.tenant_id AS "tenantId",
            ic.person_type AS "personType",
            ic.person_id AS "personId",
            ic.valid_from AS "validFrom",
            ic.valid_to AS "validTo",
            ic.qr_code AS "qrCode",
            ic.template_name AS "templateName",
            ic.status,
            ic.printed_at AS "printedAt",
            ic.issued_at AS "issuedAt",
            ic.created_at AS "createdAt",
            s.first_name AS "studentFirstName",
            s.last_name AS "studentLastName",
            s.roll_number AS "studentRollNo",
            u.first_name AS "staffFirstName",
            u.last_name AS "staffLastName"
        FROM id_cards ic
        LEFT JOIN students s ON ic.person_type = 'STUDENT' AND ic.person_id = s.id
        LEFT JOIN users u ON ic.person_type = 'STAFF' AND ic.person_id = u.id
        WHERE ic.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (personType) {
        params.push(personType);
        query += ` AND ic.person_type = $${params.length}`;
    }

    query += ` ORDER BY ic.created_at DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}
