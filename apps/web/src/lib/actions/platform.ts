'use server';

import { requireRole } from '@/lib/auth/middleware';
import { sql } from '@/lib/db';
import { encryptEmail, encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { UserRole } from '@/lib/rbac/permissions';
import { hash } from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { establishSession, impersonationExpiresAt, legacyImpersonationActorId } from '@/lib/auth/identity';
import crypto from 'crypto';

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

    const schoolRows = await sql<{ value: string }>`
        SELECT COUNT(*) AS value FROM tenants WHERE is_active = true
    `;
    const schoolCount = schoolRows[0]?.value || 0;

    const studentRows = await sql<{ value: string }>`
        SELECT COUNT(*) AS value FROM students WHERE status = 'ACTIVE'
    `;
    const studentCount = studentRows[0]?.value || 0;

    const revenueData = await sql<{ arr: string | null }>`
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
    `;

    // Churn risk = companies with subscription tier CORE and no payments in 90 days across attached tenants
    const churnData = await sql<{ churn_count: string }>`
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
    `;

    return {
        totalSchools: Number(schoolCount),
        totalARR: Number(revenueData[0]?.arr || 0),
        totalActiveStudents: Number(studentCount),
        churnRiskSchools: Number(churnData[0]?.churn_count || 0),
    };
}

/**
 * All tenants with aggregated metrics.
 */
export async function getAllPlatformTenants(): Promise<PlatformTenant[]> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const rows = await sql<{
        id: string;
        company_id: string;
        name: string;
        code: string;
        subscriptionTier: string;
        status: string;
        adminEmail: string;
        activeStudents: number;
        revenue: number;
    }>`
        SELECT
            t.id,
            t.company_id,
            t.name,
            t.code,
            c.subscription_tier AS "subscriptionTier",
            CASE WHEN t.is_active THEN 'ACTIVE' ELSE 'SUSPENDED' END AS status,
            COALESCE(
                (SELECT COALESCE(u.email_enc, u.email) FROM users u WHERE u.tenant_id = t.id AND u.role = 'SUPER_ADMIN' LIMIT 1),
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
    `;

    return rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        code: row.code,
        subscriptionTier: row.subscriptionTier || 'CORE',
        status: row.status,
        adminEmail: decryptFieldTolerant(row.adminEmail),
        activeStudents: Number(row.activeStudents),
        revenue: Number(row.revenue),
    }));
}

/**
 * Provisions a completely new Company, Tenant, and SUPER_ADMIN.
 */
export async function createTenantAction(formData: FormData) {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const name = formData.get('name') as string;
    const adminEmail = formData.get('adminEmail') as string;
    const adminFirstName = formData.get('adminFirstName') as string;
    const adminLastName = formData.get('adminLastName') as string;
    const region = (formData.get('region') as string) || 'US-EAST';

    if (!name || !adminEmail || !adminFirstName || !adminLastName) {
        return { error: 'All fields are required.' };
    }

    try {
        // Check for duplicate school name
        const existingCompany = await sql<{ id: string }>`
            SELECT id FROM companies WHERE name = ${`${name} Org`} LIMIT 1
        `;
        if (existingCompany.length > 0) {
            return { error: 'A school with this name already exists.' };
        }

        // Check for duplicate admin email
        const existingUser = await sql<{ id: string }>`
            SELECT id FROM users WHERE (email_enc = ANY(${encryptEmailCandidates(adminEmail)}::text[]) OR email = ${adminEmail}) LIMIT 1
        `;
        if (existingUser.length > 0) {
            return { error: 'A user with this email address already exists.' };
        }

        const baseCode = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase();
        const randSuffix = Math.floor(Math.random() * 900) + 100;
        const tenantCode = `${baseCode}${randSuffix}`;

        // 1. Create Company First
        const companyRows = await sql<{ id: string }>`
            INSERT INTO companies (name, subscription_tier, is_active, region) 
            VALUES (${`${name} Org`}, ${'CORE'}, ${true}, ${region}) RETURNING id
        `;
        const newCompany = companyRows[0];

        // 2. Create Tenant bounded to Company
        const tenantRows = await sql<{ id: string }>`
            INSERT INTO tenants (name, code, company_id, is_active) 
            VALUES (${name}, ${tenantCode}, ${newCompany.id}, ${true}) RETURNING id
        `;
        const newTenant = tenantRows[0];

        // 3. Create SUPER_ADMIN with a one-time temporary password.
        const temporaryPassword = crypto.randomBytes(18).toString('base64url');
        const defaultPassword = await hash(temporaryPassword, 12);
        await sql`
            INSERT INTO users (tenant_id, email_enc, first_name, last_name, role, password_hash)
            VALUES (${newTenant.id}, ${encryptEmail(adminEmail)}, ${adminFirstName}, ${adminLastName}, ${'SUPER_ADMIN'}, ${defaultPassword})
        `;

        revalidatePath('/platform/tenants');
        revalidatePath('/hq/tenants');
        revalidatePath('/hq');

        return { success: true, tenantId: newTenant.id, code: tenantCode, temporaryPassword };
    } catch (e: unknown) {
        console.error('Error creating tenant:', e);
        return { error: 'An unexpected error occurred while creating the tenant.' };
    }
}

/**
 * Phase 3: Lifecycle Management - Suspend or Reactivate a Tenant
 */
export async function toggleTenantStatusAction(tenantId: string, isActive: boolean) {
    await requireRole(UserRole.PLATFORM_ADMIN);

    await sql`UPDATE tenants SET is_active = ${isActive} WHERE id = ${tenantId}`;
    
    await logPlatformAudit('TOGGLE_TENANT_STATUS', `Status changed to ${isActive}`, undefined, tenantId);
    
    revalidatePath('/platform/tenants');
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

    // Find the super admin of the target tenant
    const admins = await sql<{
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
    }>`
        SELECT id, email, first_name AS "firstName", last_name AS "lastName"
        FROM users
        WHERE tenant_id = ${tenantId} AND role = 'SUPER_ADMIN' AND is_active = true
        LIMIT 1
    `;
    if (admins.length === 0) return { error: 'Target tenant does not have an active admin to impersonate.' };
    const targetAdmin = admins[0];

    const tenantsData = await sql<{
        tenantCode: string | null;
        tenantDomain: string | null;
        companyId: string | null;
        subscriptionTier: 'CORE' | 'AI_PRO' | 'ENTERPRISE' | null;
        activeModules: string[] | null;
    }>`
        SELECT 
            t.code AS "tenantCode",
            t.domain AS "tenantDomain",
            t.company_id AS "companyId", 
            c.subscription_tier AS "subscriptionTier", 
            c.active_modules AS "activeModules" 
        FROM tenants t 
        LEFT JOIN companies c ON t.company_id = c.id 
        WHERE t.id = ${tenantId}
    `;
    const targetCompany = tenantsData[0];

    const originalId = session.userId;
    const originalTenantId = session.tenantId;
    const originalEmail = session.email;
    const startedAt = new Date().toISOString();
    const expiresAt = impersonationExpiresAt();

    await logPlatformAudit('IMPERSONATE_TENANT', `Founder requested impersonation of tenant ${tenantId}`, targetCompany?.companyId || undefined, tenantId);

    establishSession(session, {
        userId: targetAdmin.id,
        tenantId,
        tenantCode: targetCompany?.tenantCode || undefined,
        tenantDomain: targetCompany?.tenantDomain || undefined,
        role: 'SUPER_ADMIN',
        email: targetAdmin.email,
        provider: 'impersonation',
        displayName: [targetAdmin.firstName, targetAdmin.lastName].filter(Boolean).join(' ') || targetAdmin.email,
        companyId: targetCompany?.companyId || undefined,
        subscriptionTier: targetCompany?.subscriptionTier || undefined,
        activeModules: targetCompany?.activeModules || [],
        mfaEnabled: true,
        mfaVerified: true,
        token: `impersonating:${originalId}`,
        impersonation: {
            actorUserId: originalId,
            actorTenantId: originalTenantId,
            actorEmail: originalEmail,
            startedAt,
            expiresAt,
        },
    });

    await session.save();

    return { success: true };
}

export async function returnToHQAction() {
    const session = await getSession();
    const originalUserId = session.impersonation?.actorUserId || legacyImpersonationActorId(session);
    if (!originalUserId) {
        return { error: 'Not currently impersonating a session.' };
    }

    const usersList = await sql<{
        id: string;
        tenantId: string;
        tenantCode: string | null;
        tenantDomain: string | null;
        email: string;
        firstName: string | null;
        lastName: string | null;
        mfaEnabled: boolean | null;
    }>`
        SELECT
            u.id,
            u.tenant_id AS "tenantId",
            t.code AS "tenantCode",
            t.domain AS "tenantDomain",
            COALESCE(u.email_enc, u.email) AS "email",
            u.first_name AS "firstName",
            u.last_name AS "lastName",
            u.mfa_enabled AS "mfaEnabled"
        FROM users u
        LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = ${originalUserId} AND u.role = 'PLATFORM_ADMIN' AND u.is_active = true
        LIMIT 1
    `;
    const founder = usersList[0];
    if (!founder) {
        session.destroy();
        return { error: 'Original platform session can no longer be restored.' };
    }
    founder.email = founder.email == null ? founder.email : decryptFieldTolerant(founder.email);
    
    establishSession(session, {
        userId: founder.id,
        tenantId: founder.tenantId,
        tenantCode: founder.tenantCode || undefined,
        tenantDomain: founder.tenantDomain || undefined,
        role: 'PLATFORM_ADMIN',
        email: founder.email,
        provider: 'system',
        displayName: [founder.firstName, founder.lastName].filter(Boolean).join(' ') || founder.email,
        subscriptionTier: 'ENTERPRISE',
        activeModules: ['ATTENDANCE', 'FEES', 'COMMUNICATION', 'AI_AGENTS', 'HIGHER_ED', 'COACHING', 'INTERNATIONAL', 'MULTI_CAMPUS', 'ENTERPRISE'],
        mfaEnabled: Boolean(founder.mfaEnabled),
        mfaVerified: Boolean(founder.mfaEnabled),
    });

    await session.save();
    await logPlatformAudit('RETURN_FROM_IMPERSONATION', 'Founder returned from tenant impersonation');
    return { success: true };
}

/**
 * Phase 5: Deep Platform Admin Integration Actions
 */

export async function getCompanyDetailsWithTenants(companyId: string) {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const companyRows = await sql<{
        id: string;
        name: string;
        subscriptionTier: string;
        isActive: boolean;
        region: string | null;
        activeModules: string[] | null;
        themeColor: string | null;
        domainMask: string | null;
        stripeCustomerId: string | null;
        billingStatus: string | null;
    }>`
        SELECT 
            id, name, subscription_tier AS "subscriptionTier", 
            is_active AS "isActive", region, active_modules AS "activeModules", 
            theme_color AS "themeColor", domain_mask AS "domainMask",
            stripe_customer_id AS "stripeCustomerId", billing_status AS "billingStatus"
        FROM companies WHERE id = ${companyId} LIMIT 1
    `;
    
    const tenantRows = await sql<{
        id: string;
        name: string;
        code: string;
        companyId: string;
        isActive: boolean;
    }>`
        SELECT 
            id, name, code, company_id AS "companyId", is_active AS "isActive" 
        FROM tenants WHERE company_id = ${companyId}
    `;

    return {
        company: companyRows[0],
        tenants: tenantRows
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

    await sql`
        UPDATE companies SET 
            subscription_tier = ${payload.subscriptionTier}, 
            active_modules = ${payload.activeModules || []}, 
            is_active = ${payload.isActive}, 
            theme_color = ${payload.themeColor || null}, 
            domain_mask = ${payload.domainMask || null} 
        WHERE id = ${companyId}
    `;

    await logPlatformAudit('UPDATE_COMPANY_SETTINGS', `Updated tier to ${payload.subscriptionTier}, features toggled`, companyId);

    revalidatePath(`/platform/tenants/${companyId}`);
    revalidatePath('/hq/tenants');
    
    return { success: true };
}

export async function getPlatformBillingStats() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const rows = await sql<{
        id: string;
        school: string;
        tier: string;
        status: string | null;
        date: string | Date | null;
        students: number;
    }>`
        SELECT
            c.id,
            c.name as school,
            c.subscription_tier as tier,
            c.billing_status as status,
            c.stripe_current_period_end as date,
            (SELECT COUNT(*) FROM students s JOIN tenants t ON s.tenant_id = t.id WHERE t.company_id = c.id AND s.status = 'ACTIVE') as students
        FROM companies c
        ORDER BY c.stripe_current_period_end ASC
    `;

    const invoices = rows.map((row) => {
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
        await sql`
            INSERT INTO platform_audit_logs (actor_id, target_company_id, target_tenant_id, action_type, metadata, ip_address) 
            VALUES (${session.userId}, ${targetCompanyId || null}, ${targetTenantId || null}, ${actionType}, ${metadata}, ${'127.0.0.1'})
        `;
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
    
    // Natively queries active broadcasts targeting the current node's tier
    const userTier = session.subscriptionTier || 'CORE';

    return sql<{
        id: string;
        title: string;
        message: string;
        type: string;
        isActive: boolean;
        targetTiers: string[] | null;
        createdAt: Date;
    }>`
        SELECT 
            id, title, message, type, is_active AS "isActive", 
            target_tiers AS "targetTiers", created_at AS "createdAt" 
        FROM platform_broadcasts 
        WHERE is_active = true 
        AND (target_tiers IS NULL OR ${userTier} = ANY(target_tiers)) 
        ORDER BY created_at DESC 
        LIMIT 3
    `;
}

export async function getPlatformAIAnalytics() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const logs = await sql<{
        id: string;
        companyId: string | null;
        tenantId: string | null;
        agentType: string;
        model: string;
        tokensUsed: number;
        computeCostMs: number;
        queryCostUsd: string | number;
        createdAt: Date;
    }>`
        SELECT 
            id, company_id AS "companyId", tenant_id AS "tenantId", 
            agent_type AS "agentType", model, tokens_used AS "tokensUsed", 
            compute_cost_ms AS "computeCostMs", query_cost_usd AS "queryCostUsd", 
            created_at AS "createdAt" 
        FROM ai_token_logs
    `;
    
    // Aggregation logic
    let totalTokens = 0;
    let totalCostUsd = 0;
    const modelStats: Record<string, number> = {};
    const agentStats: Record<string, { queries: number, cost: number }> = {};

    logs.forEach((log) => {
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
