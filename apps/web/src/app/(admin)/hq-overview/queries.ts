import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

/**
 * Read-side queries for the campus-facing HQ command centre.
 *
 * GROUP RESOLUTION — the group is resolved through the caller's own
 * `multi_campus_hierarchy` row, never by picking the first active row of
 * `hq_groups`. RLS would bound the latter to the caller's group in a campus
 * session, but it is arbitrary for a PLATFORM_ADMIN session (whose context
 * bypasses RLS) and it silently reports "no HQ" as "some other HQ".
 *
 * VISIBILITY — `multi_campus_hierarchy_tenant_select` exposes only the row
 * whose tenant_id is the caller's, so a campus session sees exactly one
 * mapping: its own. Sibling campuses in the same group are not readable from
 * here, and the page says so rather than implying the group has one member.
 *
 * WRITES — INSERT/UPDATE/DELETE on hq_groups, multi_campus_hierarchy and
 * group_policies all carry `WITH CHECK (app_private.rls_bypass())`, and the
 * resolver in apps/web/src/instrumentation.ts only grants bypass to
 * PLATFORM_ADMIN. No campus role can create a group or deploy a policy, so
 * this surface is read-only.
 *
 * Column names are taken from apps/web/drizzle/0000_init_baseline.sql.
 */

async function requireHqRead(): Promise<{ tenantId: string }> {
    const { tenantId, session } = await requireAuth();
    const role = session.role as UserRole;
    const allowed =
        hasPermission(role, 'hq:read') ||
        hasPermission(role, 'policy:read') ||
        hasPermission(role, 'settings:read');
    if (!allowed) {
        redirect('/unauthorized');
    }
    return { tenantId };
}

export interface HqGroup {
    id: string;
    name: string;
    hqCity: string;
    isActive: boolean;
    createdAt: Date | string;
}

export interface CampusMapping {
    id: string;
    tenantId: string;
    name: string | null;
    region: string;
    campusType: string;
    isActive: boolean | null;
}

export interface GroupPolicySummary {
    id: string;
    policyName: string;
    policyKey: string;
    policyValue: string;
    isHardBlock: boolean;
    createdAt: Date | string;
}

export interface HqOverviewData {
    /** The signed-in campus, always readable. */
    campusName: string | null;
    /** Null when this campus has no multi_campus_hierarchy row. */
    group: HqGroup | null;
    /** Mapping rows visible to this session — one row for a campus login. */
    campuses: CampusMapping[];
    policies: GroupPolicySummary[];
}

export async function getHqOverviewData(): Promise<HqOverviewData> {
    const { tenantId } = await requireHqRead();

    const [tenantResult, groupResult] = await Promise.all([
        pool.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]),
        pool.query(
            `SELECT
                g.id,
                g.name,
                g.hq_city AS "hqCity",
                g.is_active AS "isActive",
                g.created_at AS "createdAt"
             FROM multi_campus_hierarchy mch
             JOIN hq_groups g ON g.id = mch.group_id
             WHERE mch.tenant_id = $1
             LIMIT 1`,
            [tenantId],
        ),
    ]);

    const campusName = (tenantResult.rows[0]?.name as string | undefined) ?? null;
    const group = (groupResult.rows[0] as HqGroup | undefined) ?? null;

    if (!group) {
        return { campusName, group: null, campuses: [], policies: [] };
    }

    const [campusResult, policyResult] = await Promise.all([
        pool.query(
            `SELECT
                mch.id,
                mch.tenant_id AS "tenantId",
                t.name,
                mch.region,
                mch.campus_type AS "campusType",
                t.is_active AS "isActive"
             FROM multi_campus_hierarchy mch
             LEFT JOIN tenants t ON t.id = mch.tenant_id
             WHERE mch.group_id = $1
             ORDER BY t.name ASC NULLS LAST`,
            [group.id],
        ),
        pool.query(
            `SELECT
                id,
                policy_name AS "policyName",
                policy_key AS "policyKey",
                policy_value AS "policyValue",
                is_hard_block AS "isHardBlock",
                created_at AS "createdAt"
             FROM group_policies
             WHERE group_id = $1
             ORDER BY is_hard_block DESC, policy_name ASC`,
            [group.id],
        ),
    ]);

    return {
        campusName,
        group,
        campuses: campusResult.rows as CampusMapping[],
        policies: policyResult.rows as GroupPolicySummary[],
    };
}
