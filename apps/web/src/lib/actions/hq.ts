'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/middleware';

/**
 * Fetch the global HQ group assigned to the current user (typically Super Admins)
 */
export async function getHQOverviewAction() {
    const session = await getSession();
    
    // In a fully developed RBAC, we would check if they are mapped to an HQ directly.
    // For MVP prototyping, we fetch the first Active HQ Group
    const groupResult = await pool.query(
        'SELECT id, name, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt" FROM hq_groups WHERE is_active = $1 LIMIT 1',
        [true]
    );

    if (groupResult.rows.length === 0) return { group: null, campuses: [], policies: [] };

    const hqGroup = groupResult.rows[0];

    // Fetch hierarchical sub-tenants assigned to this HQ
    const campusesResult = await pool.query(
        `SELECT 
            t.id, 
            t.name, 
            mch.region, 
            mch.campus_type AS "campusType"
         FROM multi_campus_hierarchy mch
         LEFT JOIN tenants t ON mch.tenant_id = t.id
         WHERE mch.group_id = $1`,
        [hqGroup.id]
    );

    // Fetch deployed global policies
    const policiesResult = await pool.query(
        'SELECT id, group_id AS "groupId", policy_name AS "policyName", policy_key AS "policyKey", policy_value AS "policyValue", is_hard_block AS "isHardBlock", document_url AS "documentUrl", created_at AS "createdAt", updated_at AS "updatedAt" FROM group_policies WHERE group_id = $1 ORDER BY created_at DESC',
        [hqGroup.id]
    );

    return {
        group: hqGroup,
        campuses: campusesResult.rows,
        policies: policiesResult.rows,
    };
}

export async function createGroupPolicyAction(data: { groupId: string, policyName: string, policyKey: string, policyValue: string, isHardBlock: boolean, documentUrl?: string }) {
    await requireRole('PLATFORM_ADMIN', 'SUPER_ADMIN', 'GROUP_EXECUTIVE');
    
    const result = await pool.query(
        `INSERT INTO group_policies (group_id, policy_name, policy_key, policy_value, is_hard_block, document_url) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, group_id AS "groupId", policy_name AS "policyName", policy_key AS "policyKey", policy_value AS "policyValue", is_hard_block AS "isHardBlock", document_url AS "documentUrl", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [data.groupId, data.policyName, data.policyKey, data.policyValue, data.isHardBlock, data.documentUrl || '']
    );
    
    return result.rows[0];
}

export async function deleteGroupPolicyAction(policyId: string) {
    await requireRole('PLATFORM_ADMIN', 'SUPER_ADMIN', 'GROUP_EXECUTIVE');
    
    await pool.query('DELETE FROM group_policies WHERE id = $1', [policyId]);
    return true;
}
