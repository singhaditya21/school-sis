'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

/**
 * Fetch the Trust & Evidence operations log (Module 43)
 */
export async function getEvidenceLogAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    // In a production tenant-isolation model, we would strictly index
    // user-specific platform logs.
    const { rows } = await pool.query(
        `SELECT 
            id, 
            actor_id AS "actorId", 
            target_company_id AS "targetCompanyId", 
            target_tenant_id AS "targetTenantId", 
            action_type AS "actionType", 
            metadata, 
            ip_address AS "ipAddress", 
            created_at AS "createdAt"
        FROM platform_audit_logs 
        WHERE target_tenant_id = $1 
        ORDER BY created_at DESC 
        LIMIT 50`,
        [session.tenantId]
    );

    return rows;
}
