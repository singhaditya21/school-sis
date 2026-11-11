'use server';

import { pool, sql, sqlFor, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { hash } from 'bcryptjs';
import { encryptEmail, encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { cookies, headers } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/auth/session';
import { establishSession } from '@/lib/auth/identity';
import {
    CORE_DEFAULT_MODULES,
    isPermanentPlatformAdminEmail,
    isReservedWorkspaceCode,
    normalizeWorkspaceCode,
} from '@/lib/auth/platform-owner';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { logger } from '@/lib/observability/logger';

type OnboardingInput = {
    schoolName: string;
    firstName: string;
    lastName: string;
    email: string;
    domain: string;
    password: string;
};

const DOMAIN_RE = /^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/;

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
    if (isPermanentPlatformAdminEmail(email)) {
        return { ok: false, error: 'This email address is reserved for ScholarMind Platform Administration.' };
    }
    if (!DOMAIN_RE.test(domain)) {
        return { ok: false, error: 'Workspace subdomain must be 4-50 lowercase letters, numbers, or hyphens.' };
    }
    if (isReservedWorkspaceCode(domain)) {
        return { ok: false, error: 'This workspace subdomain is reserved. Please choose another.' };
    }
    if (password.length < 12 || password.length > 128) {
        return { ok: false, error: 'Password must be 12-128 characters.' };
    }

    return { ok: true, data: { schoolName, firstName, lastName, email, domain, password } };
}

async function enforceOnboardingRateLimits(input: OnboardingInput): Promise<string | null> {
    let clientIp: string | null = null;
    try {
        const hdrs = await headers();
        const forwarded =
            hdrs.get('x-vercel-forwarded-for') ||
            hdrs.get('x-real-ip') ||
            hdrs.get('x-forwarded-for');
        clientIp = forwarded?.split(',')[0]?.trim() || null;
    } catch {
        clientIp = null;
    }

    if (clientIp) {
        const ipLimit = await consumeRateLimit(clientIp, {
            scope: 'onboarding_ip',
            maxAttempts: 5,
            degradedMaxAttempts: 2,
            endpointClass: 'public-write',
            message: 'Too many workspace creation attempts from this network. Please try again later.',
        });
        if (ipLimit) return ipLimit;
    }

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

async function setupSchoolWorkspaceWithBypass(formData: FormData) {
    try {
        const input = normalizeOnboardingInput(formData);
        if (input.ok === false) return { error: input.error };

        const limitError = await enforceOnboardingRateLimits(input.data);
        if (limitError) return { error: limitError };

        const { schoolName, firstName, lastName, email, domain, password } = input.data;
        const tenantCode = normalizeWorkspaceCode(domain);
        const domainUrl = `${domain.toLowerCase()}.scholarmind.app`;

        // Ensure email isn't already used
        const existingUser = await sql<{ id: string }>`
            SELECT id FROM users WHERE (email_enc = ANY(${encryptEmailCandidates(email)}::text[]) OR lower(email) = lower(${email})) LIMIT 1
        `;
        if (existingUser.length > 0) {
            return { error: 'An administrator with this email already exists.' };
        }

        const existingDomain = await sql<{ id: string }>`
            SELECT id FROM tenants WHERE upper(code) = ${tenantCode} OR lower(domain) = ${domainUrl} LIMIT 1
        `;
        if (existingDomain.length > 0) {
            return { error: 'This workspace subdomain is already taken. Please choose another.' };
        }

        // Hash before opening the transaction: bcrypt at cost 12 takes a few
        // hundred milliseconds and there is no reason to hold a connection for it.
        const passwordHash = await hash(password, 12);

        // Self-serve tenants auto-activate immediately on the CORE tier with an
        // UPPERCASE `tenants.code` (matching `loginActionV2`), `is_active = true`,
        // and founding owner `role = 'SUPER_ADMIN'` so the school can re-login,
        // configure custom objects, and upgrade to AI_PRO/ENTERPRISE via Stripe.
        const client = await pool.connect();
        const q = sqlFor(client);
        let companyId = '';
        let tenant: { id: string };
        let adminUser: { id: string; role: string; email: string; firstName: string; lastName: string };
        try {
            await q`BEGIN`;

            const companyRows = await q<{ id: string }>`
                INSERT INTO companies (name, subscription_tier, billing_status, active_modules, is_active)
                VALUES (${schoolName}, ${'CORE'}, ${'ACTIVE'}, ${[...CORE_DEFAULT_MODULES]}::text[], ${true})
                RETURNING id
            `;
            companyId = companyRows[0].id;

            const tenantRows = await q<{ id: string }>`
                INSERT INTO tenants (company_id, name, code, domain, email, is_active)
                VALUES (${companyId}, ${schoolName}, ${tenantCode}, ${domainUrl}, ${email}, ${true})
                RETURNING id
            `;
            tenant = tenantRows[0];

            const adminUserRows = await q<{ id: string; role: string; email: string; firstName: string; lastName: string }>`
                INSERT INTO users (tenant_id, email_enc, password_hash, first_name, last_name, role, is_active)
                VALUES (${tenant.id}, ${encryptEmail(email)}, ${passwordHash}, ${firstName}, ${lastName}, ${'SUPER_ADMIN'}, ${true})
                RETURNING id, COALESCE(email_enc, email) AS email, first_name AS "firstName", last_name AS "lastName", role
            `;
            adminUser = adminUserRows[0];
            adminUser.email = adminUser.email == null ? adminUser.email : decryptFieldTolerant(adminUser.email);

            await q`COMMIT`;
        } catch (transactionError) {
            await q`ROLLBACK`.execute().catch(() => {});
            throw transactionError;
        } finally {
            client.release();
        }

        // Automatically log them in via establishSession so session expiry, tenant code,
        // and MFA enrollment gates are uniformly initialized.
        const c = await cookies();
        const session = await getIronSession<SessionData>(c, sessionOptions);
        establishSession(session, {
            userId: adminUser.id,
            tenantId: tenant.id,
            tenantCode,
            tenantDomain: domainUrl,
            role: adminUser.role,
            email: adminUser.email,
            provider: 'password',
            displayName: `${adminUser.firstName} ${adminUser.lastName}`,
            companyId,
            subscriptionTier: 'CORE',
            activeModules: [...CORE_DEFAULT_MODULES],
            mfaEnabled: false,
            mfaVerified: false,
        });
        await session.save();

        return { success: true, tenantId: tenant.id, tenantCode };
    } catch (error: unknown) {
        logger.error('onboarding.setup_failed', 'Workspace provisioning failed', {
            source: 'onboarding-action',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return { error: 'Failed to create workspace database. Please try again later.' };
    }
}
