'use server';

import { pool } from '@/lib/db';
import { getTenantId } from '@/lib/actions/scaffolding-bridge';

export async function getTenantHQPoliciesAction() {
    const tenantId = await getTenantId();
    
    // Find the HQ Group this tenant belongs to
    const hierarchyResult = await pool.query(
        `SELECT group_id AS "groupId", region, campus_type AS "campusType" 
         FROM multi_campus_hierarchy 
         WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
    );

    if (hierarchyResult.rows.length === 0) {
        return { isMappedToHQ: false, hqGroup: null, policies: [] };
    }

    const { groupId } = hierarchyResult.rows[0];

    // Get HQ Group Details
    const hqResult = await pool.query(
        `SELECT name, hq_city AS "headquartersCity" FROM hq_groups WHERE id = $1`,
        [groupId]
    );
    const hqGroup = hqResult.rows[0];

    // Get cascaded policies
    const policiesResult = await pool.query(
        `SELECT id, policy_name AS "policyName", policy_key AS "policyKey", 
                policy_value AS "policyValue", is_hard_block AS "isHardBlock", 
                document_url AS "documentUrl", created_at AS "createdAt", updated_at AS "updatedAt" 
         FROM group_policies 
         WHERE group_id = $1 
         ORDER BY created_at DESC`,
        [groupId]
    );

    return {
        isMappedToHQ: true,
        hqGroup,
        policies: policiesResult.rows
    };
}
