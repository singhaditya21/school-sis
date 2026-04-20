'use server';

import { db } from '@/lib/db';
import { hqGroups, multiCampusHierarchy, groupPolicies } from '@/lib/db/schema/hq';
import { tenants } from '@/lib/db/schema/core';
import { getSession } from '@/lib/auth/session';
import { eq, desc } from 'drizzle-orm';

/**
 * Fetch the global HQ group assigned to the current user (typically Super Admins)
 */
export async function getHQOverviewAction() {
    const session = await getSession();
    
    // In a fully developed RBAC, we would check if they are mapped to an HQ directly.
    // For MVP prototyping, we fetch the first Active HQ Group
    const groups = await db
        .select()
        .from(hqGroups)
        .where(eq(hqGroups.isActive, true))
        .limit(1);

    if (groups.length === 0) return { group: null, campuses: [], policies: [] };

    const hqGroup = groups[0];

    // Fetch hierarchical sub-tenants assigned to this HQ
    const campuses = await db
        .select({
            id: tenants.id,
            name: tenants.name,
            region: multiCampusHierarchy.region,
            campusType: multiCampusHierarchy.campusType,
        })
        .from(multiCampusHierarchy)
        .leftJoin(tenants, eq(multiCampusHierarchy.tenantId, tenants.id))
        .where(eq(multiCampusHierarchy.groupId, hqGroup.id));

    // Fetch deployed global policies
    const policies = await db
        .select()
        .from(groupPolicies)
        .where(eq(groupPolicies.groupId, hqGroup.id))
        .orderBy(desc(groupPolicies.createdAt));

    return {
        group: hqGroup,
        campuses: campuses,
        policies: policies,
    };
}
