'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { decryptFieldTolerant } from '@/lib/encryption';

/** Decrypt the tolerant-read `apaarId` on each row (ciphertext or legacy plaintext). */
function decodeApaar<T extends { apaarId: string | null }>(rows: T[]): T[] {
    return rows.map((row) => ({ ...row, apaarId: row.apaarId == null ? null : decryptFieldTolerant(row.apaarId) }));
}

export async function getDigilockerSyncLogs() {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT 
            dsl.id,
            dsl.document_type AS "documentType",
            dsl.student_id AS "studentId",
            s.first_name AS "studentName",
            s.last_name AS "studentLastName",
            COALESCE(s.apaar_id_enc, s.apaar_id) AS "apaarId",
            dsl.reference_id AS "referenceId",
            dsl.status,
            dsl.sync_attempted_at AS "syncAttemptedAt",
            dsl.error_message AS "errorMessage",
            dsl.response_hash AS "digiLockerUri",
            ic.certificate_number AS "documentNumber",
            ic.issued_date AS "issueDate"
         FROM digilocker_sync_logs dsl
         LEFT JOIN students s ON dsl.student_id = s.id
         LEFT JOIN issued_certificates ic ON dsl.reference_id = ic.id
         WHERE dsl.tenant_id = $1
         ORDER BY dsl.sync_attempted_at DESC`,
        [tenantId]
    );

    return decodeApaar(rows);
}

export async function pushToDigilocker(
    studentId: string,
    documentType: string,
): Promise<{ success: true; uri: string } | { success: false; error: string }> {
    const { tenantId } = await requireAuth('certificate:write');
    const errorMessage = 'DigiLocker delivery is unavailable because no live provider is configured.';
    await pool.query(
        `INSERT INTO digilocker_sync_logs 
         (tenant_id, student_id, document_type, xml_payload, status, error_message)
         VALUES ($1, $2, $3, $4, 'FAILED', $5)`,
        [tenantId, studentId, documentType, '', errorMessage]
    );

    return { success: false, error: errorMessage };
}

export async function getStudentsWithApaar() {
    const { tenantId } = await requireAuth('certificate:read');
    
    const { rows } = await pool.query(
        `SELECT 
            id AS "studentId",
            first_name AS "firstName",
            last_name AS "lastName",
            COALESCE(apaar_id_enc, apaar_id) AS "apaarId"
         FROM students
         WHERE tenant_id = $1
         ORDER BY first_name ASC`,
        [tenantId]
    );
    return decodeApaar(rows);
}

export async function verifyAPAARId(studentId: string, apaarId: string) {
    await requireAuth('certificate:write');

    if (!studentId.trim() || !apaarId.trim()) {
        return { success: false, message: 'Invalid APAAR ID format.' };
    }

    return {
        success: false,
        message: 'APAAR verification is unavailable because no live verifier is configured.',
    };
}
