'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

/**
 * Fetch all credentials logged in the trust ledger
 */
export async function getCredentialRegistryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const { rows } = await pool.query(
        `SELECT 
            ic.id, 
            ic.certificate_number AS "certificateNumber", 
            ic.status, 
            ic.issued_date AS "issuedDate", 
            ct.name AS "templateName", 
            s.first_name AS "studentName", 
            u.name AS "issuedBy" 
         FROM issued_certificates ic 
         LEFT JOIN certificate_templates ct ON ic.template_id = ct.id 
         LEFT JOIN students s ON ic.student_id = s.id 
         LEFT JOIN users u ON ic.issued_by = u.id 
         WHERE ic.tenant_id = $1 
         ORDER BY ic.issued_date DESC`,
        [session.tenantId]
    );

    return rows;
}
