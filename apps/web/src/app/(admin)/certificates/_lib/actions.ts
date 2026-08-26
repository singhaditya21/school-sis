'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { CERTIFICATE_TYPES, CERTIFICATE_TYPE_PREFIX } from './labels';

/** Flat result shape — Next.js erases union narrowing across the 'use server' boundary. */
export interface CertificateActionResult {
    success: boolean;
    error?: string;
    certificateId?: string;
    certificateNumber?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isUuid(value: string | null | undefined): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
}

function describeDbError(err: unknown, fallback: string): string {
    const code = (err as { code?: string })?.code;
    if (code === '23503') return 'The student or template referenced no longer exists.';
    if (code === '23505') return 'That certificate number is already in use. Try again.';
    return fallback;
}

// ─── Templates ───────────────────────────────────────────────

export interface CertificateTemplateItem {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    issuedCount: number;
    createdAt: Date;
}

/**
 * `certificate_templates` has no `updated_at` column — selecting one throws at
 * runtime. Every column below is verified against the baseline schema.
 */
export async function listCertificateTemplates(): Promise<CertificateTemplateItem[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT
             ct.id,
             ct.name,
             ct.type::text AS type,
             ct.is_active AS "isActive",
             ct.created_at AS "createdAt",
             COUNT(ic.id)::int AS "issuedCount"
         FROM certificate_templates ct
         LEFT JOIN issued_certificates ic
                ON ic.template_id = ct.id
               AND ic.tenant_id = ct.tenant_id
         WHERE ct.tenant_id = $1
         GROUP BY ct.id, ct.name, ct.type, ct.is_active, ct.created_at
         ORDER BY ct.is_active DESC, ct.name ASC`,
        [tenantId]
    );

    return rows as CertificateTemplateItem[];
}

export async function createCertificateTemplateAction(input: {
    name: string;
    type: string;
}): Promise<CertificateActionResult> {
    const { tenantId } = await requireAuth('certificate:write');

    const name = input.name?.trim();
    if (!name) return { success: false, error: 'A template name is required.' };
    if (name.length > 200) return { success: false, error: 'Template name must be 200 characters or fewer.' };
    if (!CERTIFICATE_TYPES.includes(input.type as (typeof CERTIFICATE_TYPES)[number])) {
        return { success: false, error: 'Pick a certificate type.' };
    }

    try {
        await pool.query(
            `INSERT INTO certificate_templates (tenant_id, name, type)
             VALUES ($1, $2, $3::certificate_type)`,
            [tenantId, name, input.type]
        );
    } catch (err: unknown) {
        return { success: false, error: describeDbError(err, 'Could not create the template.') };
    }

    revalidatePath('/certificates');
    return { success: true };
}

export async function setCertificateTemplateActiveAction(input: {
    templateId: string;
    isActive: boolean;
}): Promise<CertificateActionResult> {
    const { tenantId } = await requireAuth('certificate:write');

    if (!isUuid(input.templateId)) return { success: false, error: 'Invalid template.' };

    const { rowCount } = await pool.query(
        `UPDATE certificate_templates SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
        [input.isActive, input.templateId, tenantId]
    );
    if (!rowCount) return { success: false, error: 'That template no longer exists.' };

    revalidatePath('/certificates');
    return { success: true };
}

// ─── Issued certificates ─────────────────────────────────────

export interface IssuedCertificateItem {
    id: string;
    certificateNumber: string;
    studentId: string;
    studentName: string | null;
    admissionNumber: string | null;
    gradeName: string | null;
    sectionName: string | null;
    templateId: string;
    templateName: string | null;
    type: string | null;
    issuedDate: string;
    status: string;
    issuedByName: string | null;
    revokedAt: Date | null;
    revokeReason: string | null;
}

export interface CertificateFilters {
    status?: string;
    type?: string;
    search?: string;
}

export async function listIssuedCertificates(
    filters: CertificateFilters = {}
): Promise<IssuedCertificateItem[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const params: string[] = [tenantId];
    let where = 'WHERE ic.tenant_id = $1';

    if (filters.status && filters.status !== 'ALL') {
        params.push(filters.status);
        where += ` AND ic.status = $${params.length}::certificate_status`;
    }
    if (filters.type && filters.type !== 'ALL') {
        params.push(filters.type);
        where += ` AND ct.type = $${params.length}::certificate_type`;
    }
    if (filters.search?.trim()) {
        params.push(`%${filters.search.trim()}%`);
        where += ` AND (ic.certificate_number ILIKE $${params.length}
                     OR s.admission_number ILIKE $${params.length}
                     OR (s.first_name || ' ' || s.last_name) ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(
        `SELECT
             ic.id,
             ic.certificate_number AS "certificateNumber",
             ic.student_id AS "studentId",
             (s.first_name || ' ' || s.last_name) AS "studentName",
             s.admission_number AS "admissionNumber",
             g.name AS "gradeName",
             sec.name AS "sectionName",
             ic.template_id AS "templateId",
             ct.name AS "templateName",
             ct.type::text AS type,
             TO_CHAR(ic.issued_date, 'YYYY-MM-DD') AS "issuedDate",
             ic.status::text AS status,
             NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS "issuedByName",
             ic.revoked_at AS "revokedAt",
             ic.revoke_reason AS "revokeReason"
         FROM issued_certificates ic
         LEFT JOIN students s ON s.id = ic.student_id AND s.tenant_id = ic.tenant_id
         LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = ic.tenant_id
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ic.tenant_id
         LEFT JOIN certificate_templates ct ON ct.id = ic.template_id AND ct.tenant_id = ic.tenant_id
         LEFT JOIN users u ON u.id = ic.issued_by AND u.tenant_id = ic.tenant_id
         ${where}
         ORDER BY ic.issued_date DESC, ic.created_at DESC
         LIMIT 500`,
        params
    );

    return rows as IssuedCertificateItem[];
}

export interface CertificateStats {
    activeTemplates: number;
    issued: number;
    drafts: number;
    revoked: number;
}

export async function getCertificateStats(): Promise<CertificateStats> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT
             (SELECT COUNT(*)::int FROM certificate_templates
               WHERE tenant_id = $1 AND is_active) AS "activeTemplates",
             (SELECT COUNT(*)::int FROM issued_certificates
               WHERE tenant_id = $1 AND status = 'ISSUED') AS issued,
             (SELECT COUNT(*)::int FROM issued_certificates
               WHERE tenant_id = $1 AND status = 'DRAFT') AS drafts,
             (SELECT COUNT(*)::int FROM issued_certificates
               WHERE tenant_id = $1 AND status = 'REVOKED') AS revoked`,
        [tenantId]
    );

    return rows[0] as CertificateStats;
}

// ─── Student picker ──────────────────────────────────────────

export interface StudentOption {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    gradeName: string | null;
    sectionName: string | null;
    status: string;
}

export async function listStudentsForCertificate(): Promise<StudentOption[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT
             s.id,
             s.first_name AS "firstName",
             s.last_name AS "lastName",
             s.admission_number AS "admissionNumber",
             g.name AS "gradeName",
             sec.name AS "sectionName",
             s.status::text AS status
         FROM students s
         LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1
         ORDER BY g.display_order NULLS LAST, sec.name, s.roll_number NULLS LAST, s.first_name`,
        [tenantId]
    );

    return rows as StudentOption[];
}

// ─── Issue ───────────────────────────────────────────────────

/**
 * Issues a certificate against a template. The certificate number is allocated
 * under a transaction-scoped advisory lock so two registrars clicking at once
 * cannot be handed the same number — `issued_certificates.certificate_number`
 * has no unique index to fall back on.
 *
 * The student's identity at the moment of issue is snapshotted into `data`:
 * a certificate is a historical document and must not silently change when the
 * student is later promoted or renamed.
 */
export async function issueCertificateAction(input: {
    templateId: string;
    studentId: string;
    issuedDate: string;
    remarks?: string;
}): Promise<CertificateActionResult> {
    const { tenantId, userId } = await requireAuth('certificate:write');

    if (!isUuid(input.templateId)) return { success: false, error: 'Pick a certificate template.' };
    if (!isUuid(input.studentId)) return { success: false, error: 'Pick a student.' };
    if (!DATE_RE.test(input.issuedDate ?? '')) return { success: false, error: 'An issue date is required.' };

    const remarks = input.remarks?.trim() ?? '';
    if (remarks.length > 1000) return { success: false, error: 'Remarks must be 1000 characters or fewer.' };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const template = await client.query(
            `SELECT id, name, type::text AS type, is_active AS "isActive"
             FROM certificate_templates WHERE id = $1 AND tenant_id = $2`,
            [input.templateId, tenantId]
        );
        if (template.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'That template no longer exists.' };
        }
        if (!template.rows[0].isActive) {
            await client.query('ROLLBACK');
            return { success: false, error: 'That template is retired. Reactivate it before issuing against it.' };
        }

        const student = await client.query(
            `SELECT
                 s.first_name AS "firstName",
                 s.last_name AS "lastName",
                 s.admission_number AS "admissionNumber",
                 TO_CHAR(s.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
                 TO_CHAR(s.admission_date, 'YYYY-MM-DD') AS "admissionDate",
                 s.status::text AS status,
                 g.name AS "gradeName",
                 sec.name AS "sectionName"
             FROM students s
             LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
             LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
             WHERE s.id = $1 AND s.tenant_id = $2`,
            [input.studentId, tenantId]
        );
        if (student.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'That student no longer exists.' };
        }

        const type: string = template.rows[0].type;
        const prefix = CERTIFICATE_TYPE_PREFIX[type] ?? 'GC';
        const year = input.issuedDate.slice(0, 4);

        // Serialise number allocation for this tenant for the life of the transaction.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`certificate-number:${tenantId}`]);

        const existing = await client.query(
            `SELECT certificate_number AS n
             FROM issued_certificates
             WHERE tenant_id = $1 AND certificate_number LIKE $2`,
            [tenantId, `${prefix}/${year}/%`]
        );
        let next = 1;
        for (const row of existing.rows as Array<{ n: string }>) {
            const tail = Number(row.n.split('/').pop());
            if (Number.isInteger(tail) && tail >= next) next = tail + 1;
        }
        const certificateNumber = `${prefix}/${year}/${String(next).padStart(4, '0')}`;

        const snapshot = {
            studentName: [student.rows[0].firstName, student.rows[0].lastName].filter(Boolean).join(' '),
            admissionNumber: student.rows[0].admissionNumber,
            dateOfBirth: student.rows[0].dateOfBirth,
            admissionDate: student.rows[0].admissionDate,
            gradeName: student.rows[0].gradeName,
            sectionName: student.rows[0].sectionName,
            studentStatus: student.rows[0].status,
            remarks,
        };

        const inserted = await client.query(
            `INSERT INTO issued_certificates (
                 tenant_id, template_id, student_id, certificate_number,
                 issued_date, issued_by, data, status
             ) VALUES ($1, $2, $3, $4, $5::date, $6, $7::jsonb, 'ISSUED')
             RETURNING id`,
            [
                tenantId,
                input.templateId,
                input.studentId,
                certificateNumber,
                input.issuedDate,
                userId,
                JSON.stringify(snapshot),
            ]
        );

        await client.query('COMMIT');

        revalidatePath('/certificates');
        revalidatePath('/credentials');
        return { success: true, certificateId: inserted.rows[0].id, certificateNumber };
    } catch (err: unknown) {
        await client.query('ROLLBACK');
        return { success: false, error: describeDbError(err, 'Could not issue the certificate.') };
    } finally {
        client.release();
    }
}

// ─── Revoke ──────────────────────────────────────────────────

/**
 * Revocation is one-way and requires a reason: this is the record a school
 * shows when someone presents a certificate it no longer stands behind.
 */
export async function revokeCertificateAction(input: {
    certificateId: string;
    reason: string;
}): Promise<CertificateActionResult> {
    const { tenantId } = await requireAuth('credentials:revoke');

    if (!isUuid(input.certificateId)) return { success: false, error: 'Invalid certificate.' };
    const reason = input.reason?.trim();
    if (!reason) return { success: false, error: 'A revocation reason is required.' };
    if (reason.length > 1000) return { success: false, error: 'Reason must be 1000 characters or fewer.' };

    const { rowCount } = await pool.query(
        `UPDATE issued_certificates
            SET status = 'REVOKED', revoked_at = NOW(), revoke_reason = $1
          WHERE id = $2 AND tenant_id = $3 AND status <> 'REVOKED'`,
        [reason, input.certificateId, tenantId]
    );
    if (!rowCount) {
        return { success: false, error: 'That certificate is already revoked, or no longer exists.' };
    }

    revalidatePath('/certificates');
    revalidatePath('/credentials');
    revalidatePath(`/certificates/${input.certificateId}`);
    return { success: true };
}

// ─── Single record (print view) ──────────────────────────────

export interface CertificateRecord extends IssuedCertificateItem {
    data: Record<string, string | null>;
    createdAt: Date;
    schoolName: string;
    schoolAddress: string | null;
    schoolCity: string | null;
    schoolState: string | null;
    schoolAffiliationBoard: string | null;
    schoolAffiliationNumber: string | null;
    schoolUdiseCode: string | null;
}

export async function getCertificateRecord(certificateId: string): Promise<CertificateRecord | null> {
    const { tenantId } = await requireAuth('certificate:read');
    if (!isUuid(certificateId)) return null;

    const { rows } = await pool.query(
        `SELECT
             ic.id,
             ic.certificate_number AS "certificateNumber",
             ic.student_id AS "studentId",
             (s.first_name || ' ' || s.last_name) AS "studentName",
             s.admission_number AS "admissionNumber",
             g.name AS "gradeName",
             sec.name AS "sectionName",
             ic.template_id AS "templateId",
             ct.name AS "templateName",
             ct.type::text AS type,
             TO_CHAR(ic.issued_date, 'YYYY-MM-DD') AS "issuedDate",
             ic.status::text AS status,
             NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS "issuedByName",
             ic.revoked_at AS "revokedAt",
             ic.revoke_reason AS "revokeReason",
             ic.data,
             ic.created_at AS "createdAt",
             t.name AS "schoolName",
             t.address AS "schoolAddress",
             t.city AS "schoolCity",
             t.state AS "schoolState",
             t.affiliation_board AS "schoolAffiliationBoard",
             t.affiliation_number AS "schoolAffiliationNumber",
             t.udise_code AS "schoolUdiseCode"
         FROM issued_certificates ic
         JOIN tenants t ON t.id = ic.tenant_id
         LEFT JOIN students s ON s.id = ic.student_id AND s.tenant_id = ic.tenant_id
         LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = ic.tenant_id
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ic.tenant_id
         LEFT JOIN certificate_templates ct ON ct.id = ic.template_id AND ct.tenant_id = ic.tenant_id
         LEFT JOIN users u ON u.id = ic.issued_by AND u.tenant_id = ic.tenant_id
         WHERE ic.id = $1 AND ic.tenant_id = $2`,
        [certificateId, tenantId]
    );

    return (rows[0] as CertificateRecord | undefined) ?? null;
}
