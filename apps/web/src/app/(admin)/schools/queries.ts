import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

/**
 * Read-side queries for the school (campus) profile surface.
 *
 * SCOPE — `tenants` is guarded by `tenants_tenant_isolation_select`
 * (USING id = app_private.current_tenant_id()), and `multi_campus_hierarchy`
 * only returns the caller's own mapping row. A campus session can therefore
 * see exactly one school: its own. There is no way to enumerate sibling
 * schools from here, and no write path either — INSERT/UPDATE on `tenants`
 * and on `multi_campus_hierarchy` both require app_private.rls_bypass(), which
 * only a PLATFORM_ADMIN session gets (see apps/web/src/instrumentation.ts).
 * The page reflects that instead of offering create/switch/edit controls that
 * would fail.
 *
 * Column names are taken from apps/web/drizzle/0000_init_baseline.sql.
 */

async function requireSchoolRead(): Promise<{ tenantId: string }> {
    const { tenantId, session } = await requireAuth();
    const role = session.role as UserRole;
    const allowed =
        hasPermission(role, 'settings:read') ||
        hasPermission(role, 'tenants:read') ||
        hasPermission(role, 'dashboard:read');
    if (!allowed) {
        redirect('/unauthorized');
    }
    return { tenantId };
}

export interface CampusProfile {
    id: string;
    name: string;
    code: string;
    institutionType: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    affiliationBoard: string | null;
    affiliationNumber: string | null;
    udiseCode: string | null;
    isActive: boolean;
    createdAt: Date | string;
    /** Null on every campus that has not been attached to a billing company. */
    companyName: string | null;
    /** Null unless this campus has a multi_campus_hierarchy row. */
    groupName: string | null;
    groupCity: string | null;
    region: string | null;
    campusType: string | null;
}

export interface CampusCounts {
    activeStudents: number;
    staffAccounts: number;
    grades: number;
    sections: number;
}

export interface SchoolsPageData {
    campus: CampusProfile | null;
    counts: CampusCounts;
}

export async function getSchoolsPageData(): Promise<SchoolsPageData> {
    const { tenantId } = await requireSchoolRead();

    const [campusResult, countsResult] = await Promise.all([
        pool.query(
            `SELECT
                t.id,
                t.name,
                t.code,
                t.institution_type::text AS "institutionType",
                t.address,
                t.city,
                t.state,
                t.pincode,
                t.phone,
                t.email,
                t.website,
                t.affiliation_board AS "affiliationBoard",
                t.affiliation_number AS "affiliationNumber",
                t.udise_code AS "udiseCode",
                t.is_active AS "isActive",
                t.created_at AS "createdAt",
                c.name AS "companyName",
                g.name AS "groupName",
                g.hq_city AS "groupCity",
                mch.region,
                mch.campus_type AS "campusType"
             FROM tenants t
             LEFT JOIN companies c ON c.id = t.company_id
             LEFT JOIN multi_campus_hierarchy mch ON mch.tenant_id = t.id
             LEFT JOIN hq_groups g ON g.id = mch.group_id
             WHERE t.id = $1`,
            [tenantId],
        ),
        pool.query(
            `SELECT
                (SELECT COUNT(*)::int FROM students s WHERE s.tenant_id = $1 AND s.status = 'ACTIVE') AS "activeStudents",
                (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = $1 AND u.is_active AND u.role NOT IN ('PARENT', 'STUDENT')) AS "staffAccounts",
                (SELECT COUNT(*)::int FROM grades gr WHERE gr.tenant_id = $1) AS "grades",
                (SELECT COUNT(*)::int FROM sections se WHERE se.tenant_id = $1) AS "sections"`,
            [tenantId],
        ),
    ]);

    const counts = countsResult.rows[0] ?? {};

    return {
        campus: (campusResult.rows[0] as CampusProfile | undefined) ?? null,
        counts: {
            activeStudents: Number(counts.activeStudents ?? 0),
            staffAccounts: Number(counts.staffAccounts ?? 0),
            grades: Number(counts.grades ?? 0),
            sections: Number(counts.sections ?? 0),
        },
    };
}
