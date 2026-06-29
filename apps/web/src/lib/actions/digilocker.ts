'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

export async function getDigilockerSyncLogs() {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT 
            dsl.id,
            dsl.document_type AS "documentType",
            dsl.student_id AS "studentId",
            s.first_name AS "studentName",
            s.last_name AS "studentLastName",
            s.apaar_id AS "apaarId",
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

    return rows;
}

export async function pushToDigilocker(studentId: string, documentType: string) {
    const { tenantId } = await requireAuth('certificate:write');

    const mockXmlPayload = `<Certificate><StudentId>${studentId}</StudentId><Type>${documentType}</Type><Data>Mock Digilocker Content</Data></Certificate>`;

    const responseHash = `dl://${documentType.toLowerCase()}/${randomUUID()}`;
    const { rows } = await pool.query(
        `INSERT INTO digilocker_sync_logs 
         (tenant_id, student_id, document_type, xml_payload, status, response_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING response_hash AS "responseHash"`,
        [tenantId, studentId, documentType, mockXmlPayload, 'SUCCESS', responseHash]
    );
    const log = rows[0];

    return { success: true, uri: log.responseHash };
}

export async function getStudentsWithApaar() {
    const { tenantId } = await requireAuth('certificate:read');
    
    const { rows } = await pool.query(
        `SELECT 
            id AS "studentId",
            first_name AS "firstName",
            last_name AS "lastName",
            apaar_id AS "apaarId"
         FROM students
         WHERE tenant_id = $1
         ORDER BY first_name ASC`,
        [tenantId]
    );
    return rows;
}

export async function verifyAPAARId(studentId: string, apaarId: string) {
    const { tenantId } = await requireAuth('certificate:write');
    
    const isValid = apaarId.startsWith('APAAR') && apaarId.length >= 10;
    if (!isValid) {
        return { success: false, message: 'Invalid APAAR ID format.' };
    }

    await pool.query(
        `UPDATE students 
         SET apaar_id = $1
         WHERE id = $2 AND tenant_id = $3`,
        [apaarId, studentId, tenantId]
    );
        
    return { success: true, message: 'APAAR ID verified and linked successfully.' };
}
