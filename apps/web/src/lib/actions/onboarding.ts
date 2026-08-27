'use server';

import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/auth/session';
import { consumeRateLimit } from '@/lib/auth/rate-limit';

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

async function setupSchoolWorkspaceWithBypass(formData: FormData) {
    try {
        const input = normalizeOnboardingInput(formData);
        if (input.ok === false) return { error: input.error };

        const limitError = await enforceOnboardingRateLimits(input.data);
        if (limitError) return { error: limitError };

        const { schoolName, firstName, lastName, email, domain, password } = input.data;
        const domainUrl = `${domain}.scholarmind.app`;

        // Ensure email isn't already used
        const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
        if (existingUser.length > 0) {
            return { error: 'An administrator with this email already exists.' };
        }

        const { rows: existingDomain } = await pool.query('SELECT id FROM tenants WHERE code = $1 OR domain = $2 LIMIT 1', [domain, domainUrl]);
        if (existingDomain.length > 0) {
            return { error: 'This workspace subdomain is already taken. Please choose another.' };
        }

        // Hash before opening the transaction: bcrypt at cost 12 takes a few
        // hundred milliseconds and there is no reason to hold a connection for it.
        const passwordHash = await hash(password, 12);

        // `billing_status` lives on companies, not tenants — tenants has no such
        // column. Inserting it here raised `column "billing_status" of relation
        // "tenants" does not exist`, which the catch below reported as the generic
        // "Failed to create workspace database", so onboarding was dead for every
        // prospective customer with nothing in the UI to say why.
        //
        // A workspace is a billing entity (companies) plus the school itself
        // (tenants.company_id -> companies.id). Creating only the tenant left no
        // company for checkout to bill against.
        const client = await pool.connect();
        let tenant: { id: string };
        let adminUser: { id: string; role: string; email: string; firstName: string; lastName: string };
        try {
            await client.query('BEGIN');

            const { rows: companyRows } = await client.query(
                `INSERT INTO companies (name, billing_status)
                 VALUES ($1, $2)
                 RETURNING id`,
                [schoolName, 'INCOMPLETE']
            );

            const { rows: tenantRows } = await client.query(
                `INSERT INTO tenants (company_id, name, code, domain, email, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
                [companyRows[0].id, schoolName, domain, domainUrl, email, false]
            );
            tenant = tenantRows[0];

            const { rows: adminUserRows } = await client.query(
                `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role`,
                [tenant.id, email, passwordHash, firstName, lastName, 'SCHOOL_ADMIN', true]
            );
            adminUser = adminUserRows[0];

            await client.query('COMMIT');
        } catch (transactionError) {
            await client.query('ROLLBACK').catch(() => {});
            throw transactionError;
        } finally {
            client.release();
        }

        // Automatically log them in immediately so the checkout API route succeeds
        const c = await cookies();
        const session = await getIronSession<SessionData>(c, sessionOptions);
        
        session.isLoggedIn = true;
        session.userId = adminUser.id;
        session.tenantId = tenant.id;
        session.role = adminUser.role;
        session.email = adminUser.email;
        session.displayName = `${adminUser.firstName} ${adminUser.lastName}`;
        
        await session.save();

        return { success: true, tenantId: tenant.id };
    } catch (error: unknown) {
        console.error('[ONBOARDING_ERROR]', error);
        return { error: (error as { message?: string }).message || 'Failed to create workspace database. Please try again later.' };
    }
}
