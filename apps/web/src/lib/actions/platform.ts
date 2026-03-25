'use server';

import { requireRole } from '@/lib/auth/middleware';
import { db, setTenantContext } from '@/lib/db';
import { tenants, invoices, users, students } from '@/lib/db/schema';
import { sum, count, eq, and, sql } from 'drizzle-orm';
import { UserRole } from '@/lib/rbac/permissions';

export interface PlatformTenant {
    id: string;
    name: string;
    code: string;
    subscriptionTier: string;
    status: string;
    adminEmail: string;
    activeStudents: number;
    revenue: number;
}

export interface PlatformStats {
    totalSchools: number;
    totalARR: number;
    totalActiveStudents: number;
    churnRiskSchools: number;
}

/**
 * Platform-level stats — cross-tenant aggregation.
 * SECURITY: Requires PLATFORM_ADMIN or SUPER_ADMIN role.
 * Sets RLS context to 'platform' for cross-tenant reads.
 */
export async function getGlobalPlatformStats(): Promise<PlatformStats> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    // Platform admin bypasses RLS
    await setTenantContext('platform');

    const [schoolCount] = await db
        .select({ value: count() })
        .from(tenants)
        .where(eq(tenants.isActive, true));

    const [studentCount] = await db
        .select({ value: count() })
        .from(students)
        .where(eq(students.status, 'ACTIVE'));

    // Calculate ARR from paid invoices in the current year
    const [revenueData] = await db
        .select({ total: sum(invoices.paidAmount) })
        .from(invoices)
        .where(and(
            eq(invoices.status, 'PAID'),
            sql`EXTRACT(YEAR FROM ${invoices.createdAt}) = EXTRACT(YEAR FROM NOW())`
        ));

    // Churn risk = tenants with subscription tier CORE and no payments in 90 days
    const [churnData] = await db.execute(sql`
        SELECT COUNT(DISTINCT t.id) as churn_count
        FROM tenants t
        WHERE t.is_active = true
        AND t.subscription_tier = 'CORE'
        AND NOT EXISTS (
            SELECT 1 FROM payments p
            WHERE p.tenant_id = t.id
            AND p.paid_at >= NOW() - INTERVAL '90 days'
        )
    `);

    return {
        totalSchools: schoolCount?.value || 0,
        totalARR: Number(revenueData?.total || 0),
        totalActiveStudents: studentCount?.value || 0,
        churnRiskSchools: Number((churnData as any)?.[0]?.churn_count || 0),
    };
}

/**
 * All tenants with aggregated metrics — for the platform admin tenant list.
 * SECURITY: Requires PLATFORM_ADMIN or SUPER_ADMIN role.
 */
export async function getAllPlatformTenants(): Promise<PlatformTenant[]> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    // Platform admin bypasses RLS
    await setTenantContext('platform');

    const result = await db.execute(sql`
        SELECT
            t.id,
            t.name,
            t.code,
            t.subscription_tier AS "subscriptionTier",
            CASE WHEN t.is_active THEN 'ACTIVE' ELSE 'SUSPENDED' END AS status,
            COALESCE(
                (SELECT u.email FROM users u WHERE u.tenant_id = t.id AND u.role = 'SUPER_ADMIN' LIMIT 1),
                'no-admin@unknown'
            ) AS "adminEmail",
            COALESCE(
                (SELECT COUNT(*)::int FROM students s WHERE s.tenant_id = t.id AND s.status = 'ACTIVE'),
                0
            ) AS "activeStudents",
            COALESCE(
                (SELECT SUM(p.amount)::int FROM payments p WHERE p.tenant_id = t.id AND p.status = 'COMPLETED'),
                0
            ) AS revenue
        FROM tenants t
        ORDER BY t.name ASC
    `);

    return (result as any[]).map(row => ({
        id: row.id,
        name: row.name,
        code: row.code,
        subscriptionTier: row.subscriptionTier,
        status: row.status,
        adminEmail: row.adminEmail,
        activeStudents: Number(row.activeStudents),
        revenue: Number(row.revenue),
    }));
}
