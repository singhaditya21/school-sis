'use server';

import { hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { establishSession } from '@/lib/auth/identity';
import { sessionOptions, type SessionData } from '@/lib/auth/session';

type OnboardingInput = {
    schoolName: string;
    firstName: string;
    lastName: string;
    email: string;
    domain: string;
    password: string;
};

type ProvisionedWorkspace = {
    companyId: string;
    tenantId: string;
    tenantCode: string;
    tenantDomain: string;
    adminUserId: string;
    adminEmail: string;
    adminRole: string;
    displayName: string;
};

const DOMAIN_RE = /^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/;
const CORE_MODULES = ['ATTENDANCE', 'FEES', 'COMMUNICATION'] as const;

function valueFrom(formData: FormData, key: string): string {
    return String(formData.get(key) || '').trim();
}

function normalizeOnboardingInput(formData: FormData): { ok: true; data: OnboardingInput } | { ok: false; error: string } {
    const schoolName = valueFrom(formData, 'schoolName');
    const firstName = valueFrom(formData, 'adminFirstName');
    const lastName = valueFrom(formData, 'adminLastName');
    const email = valueFrom(formData, 'email').toLowerCase();
    const domain = valueFrom(formData, 'domain').toLowerCase();
    const password = valueFrom(formData, 'password');

    if (!schoolName || !firstName || !lastName || !email || !password || !domain) {
        return { ok: false, error: 'Missing required onboarding parameters.' };
    }
    if (schoolName.length > 160 || firstName.length > 80 || lastName.length > 80) {
        return { ok: false, error: 'One or more onboarding fields are too long.' };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
        return { ok: false, error: 'Enter a valid administrator email address.' };
    }
    if (!DOMAIN_RE.test(domain)) {
        return { ok: false, error: 'Workspace subdomain must be 4-50 lowercase letters, numbers, or hyphens.' };
    }
    if (password.length < 12 || password.length > 128) {
        return { ok: false, error: 'Password must be 12-128 characters.' };
    }

    return { ok: true, data: { schoolName, firstName, lastName, email, domain, password } };
}

async function enforceOnboardingRateLimits(input: OnboardingInput): Promise<string | null> {
    return await consumeRateLimit(input.email, {
        scope: 'onboarding_email',
        maxAttempts: 3,
        degradedMaxAttempts: 1,
        endpointClass: 'public-write',
        message: 'Too many workspace attempts for this email. Please try again later.',
    }) || await consumeRateLimit(input.domain, {
        scope: 'onboarding_domain',
        maxAttempts: 3,
        degradedMaxAttempts: 1,
        endpointClass: 'public-write',
        message: 'Too many workspace attempts for this subdomain. Please try again later.',
    });
}

export async function setupSchoolWorkspace(formData: FormData) {
    return runWithRlsBypass(
        RLS_BYPASS_JUSTIFICATIONS.TENANT_PROVISIONING,
        () => setupSchoolWorkspaceWithBypass(formData),
    );
}

async function provisionWorkspace(input: OnboardingInput, passwordHash: string): Promise<ProvisionedWorkspace> {
    const client = await pool.connect();
    const tenantCode = input.domain.toUpperCase();
    const tenantDomain = `${input.domain}.scholarmind.app`;

    try {
        await client.query('BEGIN');

        // Serialize competing requests for either identity. The users table intentionally
        // scopes most identities by tenant, so onboarding must enforce its global admin
        // uniqueness contract explicitly.
        const lockKeys = [`onboarding:domain:${tenantCode}`, `onboarding:email:${input.email}`].sort();
        for (const lockKey of lockKeys) {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
        }

        const { rowCount: existingUsers } = await client.query(
            'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
            [input.email],
        );
        if (existingUsers) {
            throw new OnboardingConflictError('An administrator with this email already exists.');
        }

        const { rowCount: existingDomains } = await client.query(
            'SELECT id FROM tenants WHERE code = $1 OR lower(domain) = lower($2) LIMIT 1',
            [tenantCode, tenantDomain],
        );
        if (existingDomains) {
            throw new OnboardingConflictError('This workspace subdomain is already taken. Please choose another.');
        }

        const { rows: companyRows } = await client.query<{ id: string }>(
            `INSERT INTO companies (
                name,
                billing_status,
                subscription_tier,
                active_modules,
                region,
                is_active
             ) VALUES ($1, 'TRIALING', 'CORE', $2::text[], 'IN-MUMBAI', true)
             RETURNING id`,
            [input.schoolName, [...CORE_MODULES]],
        );
        const company = companyRows[0];
        if (!company) throw new Error('Company provisioning did not return a record.');

        const { rows: tenantRows } = await client.query<{ id: string }>(
            `INSERT INTO tenants (
                company_id,
                name,
                code,
                domain,
                email,
                institution_type,
                is_active
             ) VALUES ($1, $2, $3, $4, $5, 'K12', true)
             RETURNING id`,
            [company.id, input.schoolName, tenantCode, tenantDomain, input.email],
        );
        const tenant = tenantRows[0];
        if (!tenant) throw new Error('Tenant provisioning did not return a record.');

        const { rows: adminRows } = await client.query<{
            id: string;
            email: string;
            role: string;
            firstName: string;
            lastName: string;
        }>(
            `INSERT INTO users (
                tenant_id,
                email,
                password_hash,
                first_name,
                last_name,
                role,
                is_active
             ) VALUES ($1, $2, $3, $4, $5, 'SCHOOL_ADMIN', true)
             RETURNING
                id,
                email,
                role,
                first_name AS "firstName",
                last_name AS "lastName"`,
            [tenant.id, input.email, passwordHash, input.firstName, input.lastName],
        );
        const admin = adminRows[0];
        if (!admin) throw new Error('Administrator provisioning did not return a record.');

        await client.query(
            `INSERT INTO audit_logs (
                tenant_id,
                user_id,
                action,
                entity_type,
                entity_id,
                description,
                after_state
             ) VALUES ($1, $2, 'CREATE', 'TENANT', $1, $3, $4::jsonb)`,
            [
                tenant.id,
                admin.id,
                'Initial K-12 workspace provisioned through transactional onboarding.',
                JSON.stringify({ companyId: company.id, tenantCode, institutionType: 'K12' }),
            ],
        );

        await client.query('COMMIT');

        return {
            companyId: company.id,
            tenantId: tenant.id,
            tenantCode,
            tenantDomain,
            adminUserId: admin.id,
            adminEmail: admin.email,
            adminRole: admin.role,
            displayName: `${admin.firstName} ${admin.lastName}`,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

class OnboardingConflictError extends Error {}

async function setupSchoolWorkspaceWithBypass(formData: FormData) {
    const normalized = normalizeOnboardingInput(formData);
    if (normalized.ok === false) return { error: normalized.error };

    const limitError = await enforceOnboardingRateLimits(normalized.data);
    if (limitError) return { error: limitError };

    try {
        // Hash before acquiring a database connection so CPU work does not lengthen the
        // provisioning transaction or hold its advisory locks.
        const passwordHash = await hash(normalized.data.password, 12);
        const workspace = await provisionWorkspace(normalized.data, passwordHash);

        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        establishSession(session, {
            userId: workspace.adminUserId,
            tenantId: workspace.tenantId,
            tenantCode: workspace.tenantCode,
            tenantDomain: workspace.tenantDomain,
            role: workspace.adminRole,
            email: workspace.adminEmail,
            provider: 'password',
            displayName: workspace.displayName,
            companyId: workspace.companyId,
            subscriptionTier: 'CORE',
            activeModules: [...CORE_MODULES],
            institutionType: 'K12',
            mfaEnabled: false,
            mfaVerified: false,
        });

        try {
            await session.save();
            return { success: true as const, tenantId: workspace.tenantId, redirectTo: '/onboarding' };
        } catch (sessionError) {
            console.error('[ONBOARDING_SESSION_ERROR]', sessionError);
            // The transaction is already durable. Direct the administrator to sign in
            // instead of falsely reporting that workspace creation failed.
            return {
                success: true as const,
                tenantId: workspace.tenantId,
                redirectTo: '/login',
                notice: `Workspace ${workspace.tenantCode} was created. Sign in to continue setup.`,
            };
        }
    } catch (error: unknown) {
        console.error('[ONBOARDING_ERROR]', error);
        if (error instanceof OnboardingConflictError) {
            return { error: error.message };
        }
        if ((error as { code?: string }).code === '23505') {
            return { error: 'This administrator or workspace already exists. Sign in or choose another subdomain.' };
        }
        return { error: 'Workspace creation failed before completion. No partial workspace was kept. Please try again.' };
    }
}
