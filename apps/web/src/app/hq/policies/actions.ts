'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';

/**
 * Campus-group provisioning for the HQ surface.
 *
 * hq_groups, multi_campus_hierarchy and group_policies are reachable to a
 * tenant only through its own hierarchy row, so every read below is either
 * keyed by group_id or performed by a PLATFORM_ADMIN session (which the HQ
 * layout enforces and which the db context resolver routes to the platform
 * role). Nothing here reads a tenant's data outside that membership join.
 */

export interface HqActionResult {
    success: boolean;
    error?: string;
}

const CAMPUS_TYPES = ['MAIN', 'SATELLITE', 'FRANCHISE', 'ONLINE'] as const;

export async function createCampusGroupAction(input: {
    name: string;
    hqCity: string;
}): Promise<HqActionResult & { groupId?: string }> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN, UserRole.GROUP_EXECUTIVE);

    const name = input.name.trim();
    const hqCity = input.hqCity.trim();

    if (!name || !hqCity) {
        return { success: false, error: 'Group name and headquarters city are both required.' };
    }
    if (name.length > 255 || hqCity.length > 100) {
        return { success: false, error: 'Group name or city is too long.' };
    }

    const { rows } = await pool.query(
        `INSERT INTO hq_groups (name, hq_city) VALUES ($1, $2) RETURNING id`,
        [name, hqCity],
    );

    revalidatePath('/hq/policies');
    revalidatePath('/hq/treasury');

    return { success: true, groupId: rows[0].id as string };
}

export async function attachCampusAction(input: {
    groupId: string;
    tenantId: string;
    region: string;
    campusType: string;
}): Promise<HqActionResult> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN, UserRole.GROUP_EXECUTIVE);

    const region = input.region.trim();
    if (!input.groupId || !input.tenantId) {
        return { success: false, error: 'Pick a group and a campus.' };
    }
    if (!region) {
        return { success: false, error: 'Region is required.' };
    }
    if (!CAMPUS_TYPES.includes(input.campusType as (typeof CAMPUS_TYPES)[number])) {
        return { success: false, error: 'Unknown campus type.' };
    }

    const { rows: existing } = await pool.query(
        `SELECT id FROM multi_campus_hierarchy WHERE tenant_id = $1 LIMIT 1`,
        [input.tenantId],
    );
    if (existing.length > 0) {
        return { success: false, error: 'That campus already belongs to a group. Detach it first.' };
    }

    const { rows: group } = await pool.query(`SELECT id FROM hq_groups WHERE id = $1`, [input.groupId]);
    if (group.length === 0) {
        return { success: false, error: 'That group no longer exists.' };
    }

    await pool.query(
        `INSERT INTO multi_campus_hierarchy (group_id, tenant_id, region, campus_type)
         VALUES ($1, $2, $3, $4)`,
        [input.groupId, input.tenantId, region, input.campusType],
    );

    revalidatePath('/hq/policies');
    revalidatePath('/hq/treasury');

    return { success: true };
}

export async function detachCampusAction(hierarchyId: string): Promise<HqActionResult> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN, UserRole.GROUP_EXECUTIVE);

    if (!hierarchyId) {
        return { success: false, error: 'Missing campus mapping.' };
    }

    await pool.query(`DELETE FROM multi_campus_hierarchy WHERE id = $1`, [hierarchyId]);

    revalidatePath('/hq/policies');
    revalidatePath('/hq/treasury');

    return { success: true };
}

export async function createGroupPolicyAction(input: {
    groupId: string;
    policyName: string;
    policyKey: string;
    policyValue: string;
    isHardBlock: boolean;
}): Promise<HqActionResult> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN, UserRole.GROUP_EXECUTIVE);

    const policyName = input.policyName.trim();
    const policyKey = input.policyKey.trim().toUpperCase();
    const policyValue = input.policyValue.trim();

    if (!input.groupId || !policyName || !policyKey || !policyValue) {
        return { success: false, error: 'Name, key and enforced value are all required.' };
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(policyKey)) {
        return { success: false, error: 'Policy key must be UPPER_SNAKE_CASE.' };
    }

    const { rows: duplicate } = await pool.query(
        `SELECT id FROM group_policies WHERE group_id = $1 AND policy_key = $2 LIMIT 1`,
        [input.groupId, policyKey],
    );
    if (duplicate.length > 0) {
        return { success: false, error: `${policyKey} is already defined for this group.` };
    }

    await pool.query(
        `INSERT INTO group_policies (group_id, policy_name, policy_key, policy_value, is_hard_block, document_url)
         VALUES ($1, $2, $3, $4, $5, '')`,
        [input.groupId, policyName, policyKey, policyValue, input.isHardBlock],
    );

    revalidatePath('/hq/policies');

    return { success: true };
}

export async function deleteGroupPolicyAction(input: {
    groupId: string;
    policyId: string;
}): Promise<HqActionResult> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN, UserRole.GROUP_EXECUTIVE);

    if (!input.groupId || !input.policyId) {
        return { success: false, error: 'Missing policy.' };
    }

    await pool.query(
        `DELETE FROM group_policies WHERE id = $1 AND group_id = $2`,
        [input.policyId, input.groupId],
    );

    revalidatePath('/hq/policies');

    return { success: true };
}
