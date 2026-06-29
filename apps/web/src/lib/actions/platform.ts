'use server';

import { requireRole } from '@/lib/auth/middleware';
import { pool, } from '@/lib/db';
import { UserRole } from '@/lib/rbac/permissions';
import { hash } from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';

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

    const { rows: schoolRows } = await pool.query(
        `SELECT COUNT(*) AS value FROM tenants WHERE is_active = true`
    );
    const schoolCount = schoolRows[0]?.value || 0;

    const { rows: studentRows } = await pool.query(
        `SELECT COUNT(*) AS value FROM students WHERE status = 'ACTIVE'`
    );
    const studentCount = studentRows[0]?.value || 0;

    const { rows: revenueData } = await pool.query(
        `SELECT SUM(
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
        WHERE s.status = 'ACTIVE' AND c.is_active = true`
    );

    // Churn risk = companies with subscription tier CORE and no payments in 90 days across attached tenants
    const { rows: churnData } = await pool.query(
        `SELECT COUNT(DISTINCT c.id) as churn_count
        FROM companies c
        WHERE c.is_active = true
        AND c.subscription_tier = 'CORE'
        AND NOT EXISTS (
            SELECT 1 FROM payments p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE t.company_id = c.id
            AND p.paid_at >= NOW() - INTERVAL '90 days'
        )`
    );

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

    const { rows } = await pool.query(
        `SELECT
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
        ORDER BY t.name ASC`
    );

    return rows.map((row: any) => ({
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
        const { rows: existingCompany } = await pool.query(
            `SELECT id FROM companies WHERE name = $1 LIMIT 1`,
            [`${name} Org`]
        );
        if (existingCompany.length > 0) {
            return { error: 'A school with this name already exists.' };
        }

        // Check for duplicate admin email
        const { rows: existingUser } = await pool.query(
            `SELECT id FROM users WHERE email = $1 LIMIT 1`,
            [adminEmail]
        );
        if (existingUser.length > 0) {
            return { error: 'A user with this email address already exists.' };
        }

        const baseCode = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase();
        const randSuffix = Math.floor(Math.random() * 900) + 100;
        const tenantCode = `${baseCode}${randSuffix}`;

        // 1. Create Company First
        const { rows: companyRows } = await pool.query(
            `INSERT INTO companies (name, subscription_tier, is_active, region) 
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [`${name} Org`, 'CORE', true, region]
        );
        const newCompany = companyRows[0];

        // 2. Create Tenant bounded to Company
        const { rows: tenantRows } = await pool.query(
            `INSERT INTO tenants (name, code, company_id, is_active) 
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [name, tenantCode, newCompany.id, true]
        );
        const newTenant = tenantRows[0];

        // 3. Create SUPER_ADMIN
        const defaultPassword = await hash('password', 12);
        await pool.query(
            `INSERT INTO users (tenant_id, email, first_name, last_name, role, password_hash) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [newTenant.id, adminEmail, adminFirstName, adminLastName, 'SUPER_ADMIN', defaultPassword]
        );

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

    await pool.query(`UPDATE tenants SET is_active = $1 WHERE id = $2`, [isActive, tenantId]);
    
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

    // Find the super admin of the target tenant
    const { rows: admins } = await pool.query(
        `SELECT id, email FROM users WHERE tenant_id = $1 AND role = 'SUPER_ADMIN' LIMIT 1`,
        [tenantId]
    );
    if (admins.length === 0) return { error: 'Target tenant does not have an active admin to impersonate.' };
    const targetAdmin = admins[0];

    const { rows: tenantsData } = await pool.query(
        `SELECT 
            t.company_id AS "companyId", 
            c.subscription_tier AS "subscriptionTier", 
            c.active_modules AS "activeModules" 
         FROM tenants t 
         LEFT JOIN companies c ON t.company_id = c.id 
         WHERE t.id = $1`,
        [tenantId]
    );
    const targetCompany = tenantsData[0];

    // Save Founder State & Mount Target State
    const originalId = session.userId;
    session.userId = targetAdmin.id;
    session.tenantId = tenantId;
    session.role = 'SUPER_ADMIN'; // Lowered god privileges to just super admin of this node
    session.email = targetAdmin.email;
    if (targetCompany && targetCompany.companyId) {
        session.companyId = targetCompany.companyId;
        session.subscriptionTier = targetCompany.subscriptionTier;
        session.activeModules = targetCompany.activeModules || [];
    }

    // Set Impersonation Origin Pointer (using token as a hacky transport since it's "kept for backward compatibility, not used" in session)
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
    const { rows: usersList } = await pool.query(
        `SELECT id, tenant_id AS "tenantId", email FROM users WHERE id = $1 LIMIT 1`,
        [originalUserId]
    );
    const founder = usersList[0];
    
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

    const { rows: companyRows } = await pool.query(
        `SELECT 
            id, name, subscription_tier AS "subscriptionTier", 
            is_active AS "isActive", region, active_modules AS "activeModules", 
            theme_color AS "themeColor", domain_mask AS "domainMask" 
         FROM companies WHERE id = $1 LIMIT 1`,
        [companyId]
    );
    
    const { rows: tenantRows } = await pool.query(
        `SELECT 
            id, name, code, company_id AS "companyId", is_active AS "isActive" 
         FROM tenants WHERE company_id = $1`,
        [companyId]
    );

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

    await pool.query(
        `UPDATE companies SET 
            subscription_tier = $1, 
            active_modules = $2, 
            is_active = $3, 
            theme_color = $4, 
            domain_mask = $5 
         WHERE id = $6`,
        [
            payload.subscriptionTier, 
            payload.activeModules || [], 
            payload.isActive, 
            payload.themeColor || null, 
            payload.domainMask || null, 
            companyId
        ]
    );

    await logPlatformAudit('UPDATE_COMPANY_SETTINGS', `Updated tier to ${payload.subscriptionTier}, features toggled`, companyId);

    revalidatePath(`/platform/tenants/${companyId}`);
    revalidatePath('/hq/tenants');
    
    return { success: true };
}

export async function getPlatformBillingStats() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows } = await pool.query(
        `SELECT
            c.id,
            c.name as school,
            c.subscription_tier as tier,
            c.billing_status as status,
            c.stripe_current_period_end as date,
            (SELECT COUNT(*) FROM students s JOIN tenants t ON s.tenant_id = t.id WHERE t.company_id = c.id AND s.status = 'ACTIVE') as students
        FROM companies c
        ORDER BY c.stripe_current_period_end ASC`
    );

    const invoices = rows.map((row: any) => {
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
        await pool.query(
            `INSERT INTO platform_audit_logs (actor_id, target_company_id, target_tenant_id, action_type, metadata, ip_address) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [session.userId, targetCompanyId || null, targetTenantId || null, actionType, metadata, '127.0.0.1']
        );
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

    const { rows: broadcasts } = await pool.query(
        `SELECT 
            id, title, message, type, is_active AS "isActive", 
            target_tiers AS "targetTiers", created_at AS "createdAt" 
         FROM platform_broadcasts 
         WHERE is_active = true 
         AND (target_tiers IS NULL OR $1 = ANY(target_tiers)) 
         ORDER BY created_at DESC 
         LIMIT 3`,
        [userTier]
    );

    return broadcasts;
}

/**
 * Stage 1: AI Metering
 */
export async function logAITokenUsage(companyId: string, tenantId: string, agentType: string, model: string, tokensUsed: number, costCostMs: number) {
    const queryCostUsd = (tokensUsed / 1000) * 0.002; // Assuming $0.002 per 1k tokens

    await pool.query(
        `INSERT INTO ai_token_logs (company_id, tenant_id, agent_type, model, tokens_used, compute_cost_ms, query_cost_usd) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [companyId, tenantId, agentType, model, tokensUsed, costCostMs, queryCostUsd.toString()]
    );
}

export async function getPlatformAIAnalytics() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows: logs } = await pool.query(
        `SELECT 
            id, company_id AS "companyId", tenant_id AS "tenantId", 
            agent_type AS "agentType", model, tokens_used AS "tokensUsed", 
            compute_cost_ms AS "computeCostMs", query_cost_usd AS "queryCostUsd", 
            created_at AS "createdAt" 
         FROM ai_token_logs`
    );
    
    // Aggregation logic
    let totalTokens = 0;
    let totalCostUsd = 0;
    const modelStats: Record<string, number> = {};
    const agentStats: Record<string, { queries: number, cost: number }> = {};

    logs.forEach((log: any) => {
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
