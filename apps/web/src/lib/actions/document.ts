'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function getStudentDocuments(studentId?: string) {
    const { tenantId } = await requireAuth('documents:read');
    
    let query = `SELECT sd.id, sd.student_id AS "studentId", s.first_name || ' ' || s.last_name AS "studentName", sd.document_type AS "documentType", sd.file_name AS "fileName", sd.file_size AS "fileSize", sd.is_verified AS "isVerified", sd.created_at AS "createdAt" FROM student_documents sd LEFT JOIN students s ON sd.student_id = s.id WHERE sd.tenant_id = $1`;
    const params: any[] = [tenantId];
    
    if (studentId) {
        query += ` AND sd.student_id = $2`;
        params.push(studentId);
    }
    query += ` ORDER BY sd.created_at DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

export async function verifyDocument(documentId: string) {
    const { tenantId, userId } = await requireAuth('documents:write');
    await pool.query(
        `UPDATE student_documents SET is_verified = true, verified_by = $1, verified_at = NOW() WHERE id = $2 AND tenant_id = $3`,
        [userId, documentId, tenantId]
    );
    return { success: true };
}

export async function getDocumentStats() {
    const { tenantId } = await requireAuth('documents:read');
    
    const { rows: totalRows } = await pool.query(
        `SELECT COUNT(*) as c FROM student_documents WHERE tenant_id = $1`,
        [tenantId]
    );
    const { rows: verifiedRows } = await pool.query(
        `SELECT COUNT(*) as c FROM student_documents WHERE tenant_id = $1 AND is_verified = true`,
        [tenantId]
    );

    const total = parseInt(totalRows[0].c, 10) || 0;
    const verified = parseInt(verifiedRows[0].c, 10) || 0;

    return {
        total,
        verified,
        pending: total - verified,
    };
}
