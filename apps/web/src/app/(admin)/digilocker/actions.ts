'use server';

/**
 * DigiLocker workspace actions (colocated with the /digilocker route).
 *
 * What is real here: students.apaar_id is a local record we can maintain,
 * issued_certificates are the documents that would be delivered, and
 * digilocker_sync_logs is the audit trail of past delivery attempts.
 *
 * What is NOT real: there is no DigiLocker / NAD gateway implementation in
 * this codebase, so nothing here claims to transmit or verify anything with
 * a government service.
 */

import { revalidatePath } from 'next/cache';

import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';
import { encryptIdNumber, decryptFieldTolerant } from '@/lib/encryption';

/** Decrypt the `apaarId` on rows read as COALESCE(apaar_id_enc, apaar_id). */
function decodeApaar<T extends { apaarId: string | null }>(rows: T[]): T[] {
    return rows.map((row) => ({ ...row, apaarId: row.apaarId == null ? null : decryptFieldTolerant(row.apaarId) }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}

export interface ApaarStudentRow {
    studentId: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    gradeName: string | null;
    sectionName: string | null;
    status: string;
    apaarId: string | null;
}

export interface DigilockerCertificateRow {
    id: string;
    certificateNumber: string;
    issuedDate: string;
    status: string;
    templateName: string | null;
    templateType: string | null;
    studentId: string;
    studentName: string;
    apaarId: string | null;
    lastSyncStatus: string | null;
    lastSyncAt: string | null;
    lastSyncError: string | null;
}

export interface DigilockerSyncLogRow {
    id: string;
    documentType: string;
    studentName: string | null;
    status: string;
    syncAttemptedAt: string;
    errorMessage: string | null;
}

// ─── APAAR ID register ───────────────────────────────────────

export async function listApaarStudents(): Promise<ApaarStudentRow[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT s.id AS "studentId",
                s.admission_number AS "admissionNumber",
                s.first_name AS "firstName",
                s.last_name AS "lastName",
                s.status,
                COALESCE(s.apaar_id_enc, s.apaar_id) AS "apaarId",
                g.name AS "gradeName",
                sec.name AS "sectionName"
         FROM students s
         LEFT JOIN grades g ON s.grade_id = g.id AND g.tenant_id = s.tenant_id
         LEFT JOIN sections sec ON s.section_id = sec.id AND sec.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1
         ORDER BY g.display_order ASC NULLS LAST, sec.name ASC NULLS LAST, s.first_name ASC`,
        [tenantId],
    );

    return decodeApaar(rows as ApaarStudentRow[]);
}

/**
 * Record (or clear) a student's APAAR ID in ScholarMind's own record.
 * This is a local data-entry operation — it does not check the ID against
 * NAD or any other registry, and the UI must not imply that it does.
 */
export async function setStudentApaarId(
    studentId: string,
    apaarId: string | null,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('certificate:write');

    if (!isUuid(studentId)) return { success: false, error: 'Invalid student reference.' };

    let normalised: string | null = null;
    let encValue: string | null = null;
    if (apaarId !== null && apaarId.trim() !== '') {
        normalised = apaarId.replace(/[\s-]/g, '');
        if (!/^\d{12}$/.test(normalised)) {
            return { success: false, error: 'An APAAR ID is 12 digits. Spaces and hyphens are ignored.' };
        }
        encValue = encryptIdNumber(normalised);

        // Match either an already-encrypted row or a legacy plaintext one (pre-backfill).
        const { rows: clash } = await pool.query(
            `SELECT id FROM students WHERE tenant_id = $1 AND (apaar_id_enc = $2 OR apaar_id = $3) AND id <> $4`,
            [tenantId, encValue, normalised, studentId],
        );
        if (clash.length) {
            return { success: false, error: 'That APAAR ID is already recorded against another student.' };
        }
    }

    // Store ciphertext and clear the legacy plaintext column in the same write.
    const { rows } = await pool.query(
        `UPDATE students SET apaar_id_enc = $1, apaar_id = NULL, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [encValue, studentId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'Student not found.' };

    revalidatePath('/digilocker');
    return { success: true };
}

// ─── Issued documents ────────────────────────────────────────

export async function listDigilockerCertificates(): Promise<DigilockerCertificateRow[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT ic.id,
                ic.certificate_number AS "certificateNumber",
                ic.issued_date AS "issuedDate",
                ic.status,
                t.name AS "templateName",
                t.type AS "templateType",
                s.id AS "studentId",
                s.first_name AS "studentFirstName",
                s.last_name AS "studentLastName",
                COALESCE(s.apaar_id_enc, s.apaar_id) AS "apaarId",
                latest.status AS "lastSyncStatus",
                latest.sync_attempted_at AS "lastSyncAt",
                latest.error_message AS "lastSyncError"
         FROM issued_certificates ic
         INNER JOIN students s ON ic.student_id = s.id AND s.tenant_id = ic.tenant_id
         LEFT JOIN certificate_templates t ON ic.template_id = t.id AND t.tenant_id = ic.tenant_id
         LEFT JOIN LATERAL (
             SELECT dsl.status, dsl.sync_attempted_at, dsl.error_message
             FROM digilocker_sync_logs dsl
             WHERE dsl.tenant_id = ic.tenant_id AND dsl.reference_id = ic.id
             ORDER BY dsl.sync_attempted_at DESC
             LIMIT 1
         ) latest ON true
         WHERE ic.tenant_id = $1 AND ic.status <> 'REVOKED'
         ORDER BY ic.issued_date DESC`,
        [tenantId],
    );

    return (rows as {
        id: string;
        certificateNumber: string;
        issuedDate: Date | string;
        status: string;
        templateName: string | null;
        templateType: string | null;
        studentId: string;
        studentFirstName: string;
        studentLastName: string;
        apaarId: string | null;
        lastSyncStatus: string | null;
        lastSyncAt: Date | null;
        lastSyncError: string | null;
    }[]).map((r) => ({
        id: r.id,
        certificateNumber: r.certificateNumber,
        issuedDate:
            typeof r.issuedDate === 'string'
                ? r.issuedDate
                : new Date(r.issuedDate).toISOString().slice(0, 10),
        status: r.status,
        templateName: r.templateName,
        templateType: r.templateType,
        studentId: r.studentId,
        studentName: `${r.studentFirstName} ${r.studentLastName}`.trim(),
        apaarId: r.apaarId == null ? null : decryptFieldTolerant(r.apaarId),
        lastSyncStatus: r.lastSyncStatus,
        lastSyncAt: r.lastSyncAt ? new Date(r.lastSyncAt).toISOString() : null,
        lastSyncError: r.lastSyncError,
    }));
}

// ─── Sync attempt history ────────────────────────────────────

export async function listDigilockerSyncAttempts(): Promise<DigilockerSyncLogRow[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT dsl.id,
                dsl.document_type AS "documentType",
                dsl.status,
                dsl.sync_attempted_at AS "syncAttemptedAt",
                dsl.error_message AS "errorMessage",
                s.first_name AS "studentFirstName",
                s.last_name AS "studentLastName"
         FROM digilocker_sync_logs dsl
         LEFT JOIN students s ON dsl.student_id = s.id AND s.tenant_id = dsl.tenant_id
         WHERE dsl.tenant_id = $1
         ORDER BY dsl.sync_attempted_at DESC
         LIMIT 100`,
        [tenantId],
    );

    return (rows as {
        id: string;
        documentType: string;
        status: string;
        syncAttemptedAt: Date;
        errorMessage: string | null;
        studentFirstName: string | null;
        studentLastName: string | null;
    }[]).map((r) => ({
        id: r.id,
        documentType: r.documentType,
        status: r.status,
        syncAttemptedAt: new Date(r.syncAttemptedAt).toISOString(),
        errorMessage: r.errorMessage,
        studentName: r.studentFirstName
            ? `${r.studentFirstName} ${r.studentLastName ?? ''}`.trim()
            : null,
    }));
}
