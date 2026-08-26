import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import PolicyClient, { type CampusGroup, type GroupCampus, type GroupPolicy, type UnassignedCampus } from './PolicyClient';

export const metadata = {
    title: 'Global Policy Engine | ScholarMind HQ',
};

/**
 * Multi-campus policy cascading.
 *
 * Groups, their campus membership and their policies are all keyed by
 * hq_groups.id — the same membership edge RLS uses to expose a policy to a
 * campus tenant — so a policy is only ever read alongside the campuses that
 * actually inherit it.
 */
export default async function HQPoliciesPage({
    searchParams,
}: {
    searchParams: Promise<{ group?: string }>;
}) {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN, UserRole.GROUP_EXECUTIVE);

    const { group: requestedGroup } = await searchParams;

    const { rows: groupRows } = await pool.query(
        `SELECT
            g.id,
            g.name,
            g.hq_city AS "hqCity",
            g.is_active AS "isActive",
            COALESCE(m.campus_count, 0)::int AS "campusCount",
            COALESCE(p.policy_count, 0)::int AS "policyCount"
         FROM hq_groups g
         LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS campus_count
            FROM multi_campus_hierarchy mch WHERE mch.group_id = g.id
         ) m ON TRUE
         LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS policy_count
            FROM group_policies gp WHERE gp.group_id = g.id
         ) p ON TRUE
         ORDER BY g.created_at ASC`
    );

    const groups = groupRows as CampusGroup[];
    const activeGroup =
        groups.find((g) => g.id === requestedGroup) ?? groups[0] ?? null;

    let campuses: GroupCampus[] = [];
    let policies: GroupPolicy[] = [];

    if (activeGroup) {
        const { rows: campusRows } = await pool.query(
            `SELECT
                mch.id,
                mch.tenant_id AS "tenantId",
                mch.region,
                mch.campus_type AS "campusType",
                t.name,
                t.code,
                t.is_active AS "isActive",
                COALESCE(s.active_students, 0)::int AS "activeStudents"
             FROM multi_campus_hierarchy mch
             JOIN tenants t ON t.id = mch.tenant_id
             LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS active_students
                FROM students s WHERE s.tenant_id = t.id AND s.status = 'ACTIVE'
             ) s ON TRUE
             WHERE mch.group_id = $1
             ORDER BY mch.region ASC, t.name ASC`,
            [activeGroup.id],
        );
        campuses = campusRows as GroupCampus[];

        const { rows: policyRows } = await pool.query(
            `SELECT
                id,
                policy_name  AS "policyName",
                policy_key   AS "policyKey",
                policy_value AS "policyValue",
                is_hard_block AS "isHardBlock",
                created_at   AS "createdAt"
             FROM group_policies
             WHERE group_id = $1
             ORDER BY created_at DESC`,
            [activeGroup.id],
        );
        policies = policyRows as GroupPolicy[];
    }

    const { rows: unassignedRows } = await pool.query(
        `SELECT t.id, t.name, t.code
         FROM tenants t
         WHERE NOT EXISTS (
            SELECT 1 FROM multi_campus_hierarchy mch WHERE mch.tenant_id = t.id
         )
         ORDER BY t.name ASC`
    );

    return (
        <PolicyClient
            groups={groups}
            activeGroupId={activeGroup?.id ?? null}
            campuses={campuses}
            policies={policies}
            unassigned={unassignedRows as UnassignedCampus[]}
        />
    );
}
