'use server';

import { sql } from '@/lib/db';
import { getTenantId } from '@/lib/actions/scaffolding-bridge';

export async function getTenantHQPoliciesAction() {
    const tenantId = await getTenantId();
    
    // Find the HQ Group this tenant belongs to
    const hierarchyRows = await sql<{
        groupId: string;
        region: string | null;
        campusType: string | null;
    }>`
        SELECT group_id AS "groupId", region, campus_type AS "campusType" 
        FROM multi_campus_hierarchy 
        WHERE tenant_id = ${tenantId} LIMIT 1
    `;

    if (hierarchyRows.length === 0) {
        return { isMappedToHQ: false, hqGroup: null, policies: [] };
    }

    const { groupId } = hierarchyRows[0];

    // Get HQ Group Details
    const hqRows = await sql<{
        name: string;
        headquartersCity: string | null;
    }>`
        SELECT name, hq_city AS "headquartersCity" FROM hq_groups WHERE id = ${groupId}
    `;
    const hqGroup = hqRows[0];

    // Get cascaded policies
    const policies = await sql<{
        id: string;
        policyName: string;
        policyKey: string;
        policyValue: string;
        isHardBlock: boolean;
        documentUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>`
        SELECT id, policy_name AS "policyName", policy_key AS "policyKey", 
               policy_value AS "policyValue", is_hard_block AS "isHardBlock", 
               document_url AS "documentUrl", created_at AS "createdAt", updated_at AS "updatedAt" 
        FROM group_policies 
        WHERE group_id = ${groupId} 
        ORDER BY created_at DESC
    `;

    return {
        isMappedToHQ: true,
        hqGroup,
        policies
    };
}
