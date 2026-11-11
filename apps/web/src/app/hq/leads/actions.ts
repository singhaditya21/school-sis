'use server';

import crypto from 'node:crypto';
import { hash } from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import {
    CORE_DEFAULT_MODULES,
    isPermanentPlatformAdminEmail,
    isReservedWorkspaceCode,
    PLATFORM_HQ_COMPANY_NAME,
} from '@/lib/auth/platform-owner';
import { decryptFieldTolerant, encryptEmail, encryptEmailCandidates } from '@/lib/encryption';
import { logger } from '@/lib/observability/logger';

export interface LeadActionResult {
    success: boolean;
    error?: string;
}

export interface ProvisionLeadTenantResult {
    success: boolean;
    error?: string;
    tenantId?: string;
    tenantCode?: string;
    schoolName?: string;
    adminEmail?: string;
    temporaryPassword?: string;
}

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CLOSED'] as const;

export async function updateLeadStatusAction(input: {
    leadId: string;
    status: string;
}): Promise<LeadActionResult> {
    await requireRole(UserRole.PLATFORM_ADMIN);

    if (!input.leadId) {
        return { success: false, error: 'Missing lead.' };
    }
    if (!LEAD_STATUSES.includes(input.status as (typeof LEAD_STATUSES)[number])) {
        return { success: false, error: 'Unknown lead status.' };
    }

    const { rowCount } = await pool.query(
        `UPDATE marketing_leads SET status = $1 WHERE id = $2`,
        [input.status, input.leadId],
    );

    if (!rowCount) {
        return { success: false, error: 'That lead no longer exists.' };
    }

    revalidatePath('/hq/leads');

    return { success: true };
}

export async function provisionTenantFromLeadAction(input: {
    leadId: string;
}): Promise<ProvisionLeadTenantResult> {
    const auth = await requireRole(UserRole.PLATFORM_ADMIN);

    if (!input.leadId) {
        return { success: false, error: 'Missing lead identifier.' };
    }

    try {
        const { rows: leadRows } = await pool.query<{
            id: string;
            contactName: string;
            contactEmail: string | null;
            schoolName: string;
            status: string;
        }>(
            `SELECT
                id,
                contact_name AS "contactName",
                COALESCE(contact_email_enc, contact_email) AS "contactEmail",
                school_name AS "schoolName",
                status
             FROM marketing_leads
             WHERE id = $1
             LIMIT 1`,
            [input.leadId],
        );

        const lead = leadRows[0];
        if (!lead) {
            return { success: false, error: 'Lead not found.' };
        }

        const schoolName = lead.schoolName.trim();
        const adminEmail = decryptFieldTolerant(lead.contactEmail).trim().toLowerCase();

        if (!schoolName || !adminEmail || !adminEmail.includes('@')) {
            return { success: false, error: 'Lead is missing a valid school name or email address.' };
        }
        if (isPermanentPlatformAdminEmail(adminEmail)) {
            return {
                success: false,
                error: 'This email address is reserved for ScholarMind Platform Administration.',
            };
        }
        if (
            schoolName.toLowerCase() === PLATFORM_HQ_COMPANY_NAME.toLowerCase() ||
            isReservedWorkspaceCode(schoolName)
        ) {
            return { success: false, error: 'This institution name is reserved by ScholarMind HQ.' };
        }

        const nameParts = lead.contactName.trim().split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || 'School';
        const lastName = nameParts.slice(1).join(' ') || 'Administrator';

        const existingUser = await pool.query<{ id: string }>(
            `SELECT id
             FROM users
             WHERE email_enc = ANY($1::text[])
                OR lower(email) = $2
             LIMIT 1`,
            [encryptEmailCandidates(adminEmail), adminEmail],
        );
        if (existingUser.rows.length > 0) {
            return {
                success: false,
                error: `A user account already exists for ${adminEmail}.`,
            };
        }

        const baseCode = schoolName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() || 'SCH';
        let tenantCode = `${baseCode}${Math.floor(Math.random() * 900) + 100}`;
        for (let attempt = 0; attempt < 5; attempt++) {
            if (!isReservedWorkspaceCode(tenantCode)) {
                const collision = await pool.query(
                    `SELECT 1 FROM tenants WHERE upper(code) = $1 LIMIT 1`,
                    [tenantCode],
                );
                if (collision.rows.length === 0) break;
            }
            tenantCode = `${baseCode}${Math.floor(Math.random() * 9000) + 1000}`;
        }
        const domainUrl = `${tenantCode.toLowerCase()}.scholarmind.app`;
        const temporaryPassword = crypto.randomBytes(14).toString('base64url');
        const passwordHash = await hash(temporaryPassword, 12);

        const client = await pool.connect();
        let companyId = '';
        let tenantId = '';
        try {
            await client.query('BEGIN');

            const companyRes = await client.query<{ id: string }>(
                `INSERT INTO companies (name, subscription_tier, billing_status, active_modules, is_active, region)
                 VALUES ($1, 'CORE', 'ACTIVE', $2::text[], true, 'IN-SOUTH')
                 RETURNING id`,
                [`${schoolName} Org`, [...CORE_DEFAULT_MODULES]],
            );
            companyId = companyRes.rows[0].id;

            const tenantRes = await client.query<{ id: string }>(
                `INSERT INTO tenants (name, code, domain, email, company_id, is_active)
                 VALUES ($1, $2, $3, $4, $5, true)
                 RETURNING id`,
                [schoolName, tenantCode, domainUrl, adminEmail, companyId],
            );
            tenantId = tenantRes.rows[0].id;

            await client.query(
                `INSERT INTO users (tenant_id, email_enc, first_name, last_name, role, password_hash, is_active)
                 VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', $5, true)`,
                [tenantId, encryptEmail(adminEmail), firstName, lastName, passwordHash],
            );

            await client.query(
                `UPDATE marketing_leads SET status = 'CLOSED' WHERE id = $1`,
                [lead.id],
            );

            await client.query(
                `INSERT INTO platform_audit_logs (actor_id, target_company_id, target_tenant_id, action_type, metadata, ip_address)
                 VALUES ($1, $2, $3, 'PROVISION_TENANT_FROM_LEAD', $4, '127.0.0.1')`,
                [
                    auth.userId,
                    companyId,
                    tenantId,
                    `Provisioned tenant ${schoolName} (${tenantCode}) from inbound lead ${lead.id}`,
                ],
            );

            await client.query('COMMIT');
        } catch (txError) {
            await client.query('ROLLBACK').catch(() => {});
            throw txError;
        } finally {
            client.release();
        }

        revalidatePath('/hq/leads');
        revalidatePath('/hq/tenants');
        revalidatePath('/hq');
        revalidatePath('/platform/tenants');

        return {
            success: true,
            tenantId,
            tenantCode,
            schoolName,
            adminEmail,
            temporaryPassword,
        };
    } catch (error) {
        logger.error('hq.lead_provision_failed', 'Failed to provision tenant from inbound lead', {
            source: 'hq-leads-action',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return {
            success: false,
            error: 'Could not provision workspace from this lead. Check logs for details.',
        };
    }
}
