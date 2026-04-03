'use server';

import { requireRole } from '@/lib/auth/middleware';
import { db, setTenantContext } from '@/lib/db';
import { tenants, companies, invoices, users, students } from '@/lib/db/schema';
import { sum, count, eq, and, sql, desc, inArray } from 'drizzle-orm';
import { UserRole } from '@/lib/rbac/permissions';
import { hash } from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { platformAuditLogs, platformBroadcasts, aiTokenLogs } from '@/lib/db/schema/platform';

export interface PlatformTenant {
    id: string;
    companyId: string;
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
 */
export async function getGlobalPlatformStats(): Promise<PlatformStats> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    const [schoolCount] = await db
        .select({ value: count() })
        .from(tenants)
        .where(eq(tenants.isActive, true));

    const [studentCount] = await db
        .select({ value: count() })
        .from(students)
        .where(eq(students.status, 'ACTIVE'));

    const [revenueData] = await db.execute(sql`
        SELECT SUM(
            CASE 
                WHEN c.subscription_tier = 'CORE' THEN 10
                WHEN c.subscription_tier = 'AI_PRO' THEN 18
                WHEN c.subscription_tier = 'ENTERPRISE' THEN 30
                ELSE 0
            END
        ) * 12 as arr
        FROM students s
        JOIN tenants t ON s.tenant_id = t.id
        JOIN companies c ON t.company_id = c.id
        WHERE s.status = 'ACTIVE' AND c.is_active = true
    `);

    // Churn risk = companies with subscription tier CORE and no payments in 90 days across attached tenants
    const [churnData] = await db.execute(sql`
        SELECT COUNT(DISTINCT c.id) as churn_count
        FROM companies c
        WHERE c.is_active = true
        AND c.subscription_tier = 'CORE'
        AND NOT EXISTS (
            SELECT 1 FROM payments p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE t.company_id = c.id
            AND p.paid_at >= NOW() - INTERVAL '90 days'
        )
    `);

    return {
        totalSchools: schoolCount?.value || 0,
        totalARR: Number((revenueData as any)?.[0]?.arr || 0),
        totalActiveStudents: studentCount?.value || 0,
        churnRiskSchools: Number((churnData as any)?.[0]?.churn_count || 0),
    };
}

/**
 * All tenants with aggregated metrics.
 */
export async function getAllPlatformTenants(): Promise<PlatformTenant[]> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    const result = await db.execute(sql`
        SELECT
            t.id,
            t.company_id,
            t.name,
            t.code,
            c.subscription_tier AS "subscriptionTier",
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
        LEFT JOIN companies c ON t.company_id = c.id
        ORDER BY t.name ASC
    `);

    return (result as any[]).map(row => ({
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        code: row.code,
        subscriptionTier: row.subscriptionTier || 'CORE',
        status: row.status,
        adminEmail: row.adminEmail,
        activeStudents: Number(row.activeStudents),
        revenue: Number(row.revenue),
    }));
}

/**
 * Provisions a completely new Company, Tenant, and SUPER_ADMIN.
 */
export async function createTenantAction(formData: FormData) {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    const name = formData.get('name') as string;
    const adminEmail = formData.get('adminEmail') as string;
    const adminFirstName = formData.get('adminFirstName') as string;
    const adminLastName = formData.get('adminLastName') as string;
    const region = formData.get('region') as string || 'US-EAST';

    if (!name || !adminEmail || !adminFirstName || !adminLastName) {
        return { error: 'All fields are required.' };
    }

    try {
        const baseCode = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase();
        const randSuffix = Math.floor(Math.random() * 900) + 100;
        const tenantCode = `${baseCode}${randSuffix}`;

        // 1. Create Company First
        const [newCompany] = await db.insert(companies).values({
            name: `${name} Org`,
            subscriptionTier: 'CORE',
            isActive: true,
            region: region
        }).returning();

        // 2. Create Tenant bounded to Company
        const [newTenant] = await db.insert(tenants).values({
            name,
            code: tenantCode,
            companyId: newCompany.id,
            isActive: true,
        }).returning();

        // 3. Create SUPER_ADMIN
        const defaultPassword = await hash('password', 12);
        await db.insert(users).values({
            tenantId: newTenant.id,
            email: adminEmail,
            firstName: adminFirstName,
            lastName: adminLastName,
            role: 'SUPER_ADMIN',
            passwordHash: defaultPassword
        });

        revalidatePath('/hq/tenants');
        revalidatePath('/hq');

        return { success: true, tenantId: newTenant.id, code: tenantCode };
    } catch (e: any) {
        console.error('Error creating tenant:', e);
        return { error: 'An unexpected error occurred while creating the tenant.' };
    }
}

/**
 * Phase 3: Lifecycle Management - Suspend or Reactivate a Tenant
 */
export async function toggleTenantStatusAction(tenantId: string, isActive: boolean) {
    await requireRole(UserRole.PLATFORM_ADMIN);
    await setTenantContext('platform');

    await db.update(tenants).set({ isActive }).where(eq(tenants.id, tenantId));
    
    await logPlatformAudit('TOGGLE_TENANT_STATUS', `Status changed to ${isActive}`, undefined, tenantId);
    
    revalidatePath('/hq/tenants');
    
    return { success: true };
}

/**
 * Phase 4: Tech Support Impersonation Engine
 */
export async function impersonateTenantAction(tenantId: string) {
    await requireRole(UserRole.PLATFORM_ADMIN);
    
    const session = await getSession();
    if (session.role !== 'PLATFORM_ADMIN') return { error: 'Unauthorized' };

    await setTenantContext('platform');

    // Find the super admin of the target tenant
    const [targetAdmin] = await db.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.role, 'SUPER_ADMIN'))).limit(1);
    if (!targetAdmin) return { error: 'Target tenant does not have an active admin to impersonate.' };

    const [targetCompany] = await db.select().from(tenants)
        .leftJoin(companies, eq(tenants.companyId, companies.id))
        .where(eq(tenants.id, tenantId));

    // Save Founder State & Mount Target State
    const originalId = session.userId;
    session.userId = targetAdmin.id;
    session.tenantId = tenantId;
    session.role = 'SUPER_ADMIN'; // Lowered god privileges to just super admin of this node
    session.email = targetAdmin.email;
    if (targetCompany && targetCompany.companies) {
        session.companyId = targetCompany.companies.id;
        session.subscriptionTier = targetCompany.companies.subscriptionTier;
        session.activeModules = targetCompany.companies.activeModules || [];
    }

    // Set Impersonation Origin Pointer (using token as a hacky transport since it's "kept for backward compatibility, not used" in session)
    // Wait, the session object is strictly typed. We should add `impersonatingFromHQ` or use token.
    // Set Impersonation Origin Pointer
    session.token = `impersonating:${originalId}`;

    await session.save();
    
    await logPlatformAudit('IMPERSONATE_TENANT', `Founder requested impersonation of tenant ${tenantId}`, session.companyId, tenantId);

    return { success: true };
}

export async function returnToHQAction() {
    const session = await getSession();
    if (!session.token.startsWith('impersonating:')) {
        return { error: 'Not currently impersonating a session.' };
    }

    const originalUserId = session.token.split(':')[1];
    
    await setTenantContext('platform');
    const [founder] = await db.select().from(users).where(eq(users.id, originalUserId)).limit(1);
    
    session.userId = founder.id;
    session.tenantId = founder.tenantId;
    session.role = 'PLATFORM_ADMIN';
    session.email = founder.email;
    session.token = '';
    // Strip company tier payload from local node mapping to prevent logic pollution. Platform routing doesn't require activeModules directly.
    session.subscriptionTier = undefined;
    session.activeModules = [];

    await session.save();
    return { success: true };
}

/**
 * Phase 5: Deep Platform Admin Integration Actions
 */

export async function getCompanyDetailsWithTenants(companyId: string) {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    
    const companyTenants = await db.select().from(tenants).where(eq(tenants.companyId, companyId));

    return {
        company,
        tenants: companyTenants
    };
}

export async function updateCompanySettingsAction(companyId: string, payload: {
    subscriptionTier: 'CORE' | 'AI_PRO' | 'ENTERPRISE';
    activeModules: string[];
    isActive: boolean;
    themeColor?: string;
    domainMask?: string;
}) {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    await db.update(companies).set({
        subscriptionTier: payload.subscriptionTier,
        activeModules: payload.activeModules,
        isActive: payload.isActive,
        themeColor: payload.themeColor,
        domainMask: payload.domainMask || null
    }).where(eq(companies.id, companyId));

    await logPlatformAudit('UPDATE_COMPANY_SETTINGS', `Updated tier to ${payload.subscriptionTier}, features toggled`, companyId);

    revalidatePath(`/platform/tenants/${companyId}`);
    revalidatePath('/hq/tenants');
    
    return { success: true };
}

export async function getPlatformBillingStats() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    const result = await db.execute(sql`
        SELECT
            c.id,
            c.name as school,
            c.subscription_tier as tier,
            c.billing_status as status,
            c.stripe_current_period_end as date,
            (SELECT COUNT(*) FROM students s JOIN tenants t ON s.tenant_id = t.id WHERE t.company_id = c.id AND s.status = 'ACTIVE') as students
        FROM companies c
        ORDER BY c.stripe_current_period_end ASC
    `);

    const invoices = (result as any[]).map(row => {
        let amount = 0;
        const students = Number(row.students);
        if (row.tier === 'CORE') amount = students * 10;
        if (row.tier === 'AI_PRO') amount = students * 18;
        if (row.tier === 'ENTERPRISE') amount = students * 30;

        return {
            id: row.id.substring(0, 8),
            rawId: row.id,
            school: row.school,
            amount,
            status: row.status || 'PAID', // Fallback to PAID if no billing sync
            date: row.date ? new Date(row.date).toLocaleDateString() : 'N/A',
            tier: row.tier
        };
    });

    return invoices;
}

/**
 * Stage 2: Central Logs & Impersonation Safety
 */
export async function logPlatformAudit(actionType: string, metadata: string, targetCompanyId?: string, targetTenantId?: string) {
    const session = await getSession();
    if (!session.userId) return;

    try {
        await setTenantContext('platform');
        await db.insert(platformAuditLogs).values({
            actorId: session.userId,
            targetCompanyId: targetCompanyId || null,
            targetTenantId: targetTenantId || null,
            actionType,
            metadata: metadata,
            ipAddress: '127.0.0.1' // Ideally read from headers
        });
    } catch(e) {
        console.error('Audit Log Failed', e);
    }
}

/**
 * Stage 5: Global Notifications Array
 */
export async function fetchActiveBroadcasts() {
    const session = await getSession();
    if (!session.isLoggedIn) return [];

    await setTenantContext('platform');
    
    // Natively queries active broadcasts targeting the current node's tier
    const userTier = session.subscriptionTier || 'CORE';

    const broadcasts = await db.select().from(platformBroadcasts)
        .where(and(
            eq(platformBroadcasts.isActive, true),
            // Match tiers if targeted, otherwise assume public broadcast
            sql`(${platformBroadcasts.targetTiers} IS NULL OR ${userTier} = ANY(${platformBroadcasts.targetTiers}))`
        ))
        .orderBy(desc(platformBroadcasts.createdAt))
        .limit(3);

    return broadcasts;
}

/**
 * Stage 1: AI Metering
 */
export async function logAITokenUsage(companyId: string, tenantId: string, agentType: string, model: string, tokensUsed: number, costCostMs: number) {
    await setTenantContext('platform');
    const queryCostUsd = (tokensUsed / 1000) * 0.002; // Assuming $0.002 per 1k tokens

    await db.insert(aiTokenLogs).values({
        companyId,
        tenantId,
        agentType,
        model,
        tokensUsed,
        computeCostMs: costCostMs,
        queryCostUsd: queryCostUsd.toString(),
    });
}

export async function getPlatformAIAnalytics() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    const logs = await db.select().from(aiTokenLogs);
    
    // Aggregation logic
    let totalTokens = 0;
    let totalCostUsd = 0;
    const modelStats: Record<string, number> = {};
    const agentStats: Record<string, { queries: number, cost: number }> = {};

    logs.forEach(log => {
        totalTokens += log.tokensUsed;
        const cost = Number(log.queryCostUsd);
        totalCostUsd += cost;

        if (!modelStats[log.model]) modelStats[log.model] = 0;
        modelStats[log.model] += log.tokensUsed;

        if (!agentStats[log.agentType]) agentStats[log.agentType] = { queries: 0, cost: 0 };
        agentStats[log.agentType].queries += 1;
        agentStats[log.agentType].cost += cost;
    });

    return {
        totalTokens,
        totalCostUsd,
        modelStats,
        agentStats,
        totalQueries: logs.length
    };
}
