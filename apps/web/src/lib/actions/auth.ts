'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { clearRateLimit, consumeLoginRateLimit } from '@/lib/auth/rate-limit';
import { sql, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { verifyMFACode } from '@/lib/auth/mfa';
import { establishSession } from '@/lib/auth/identity';
import { encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';

/**
 * Login action — production-ready authentication.
 *
 * SECURITY:
 * - bcrypt password comparison (timing-safe)
 * - Tenant lookup via school code or direct user query
 * - Session creation with real user data
 * - Password minimum 8 chars with Zod validation
 */

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    schoolCode: z.string().optional(),
    mfaCode: z.string().optional(),
});

const PLATFORM_ACTIVE_MODULES = [
    'ATTENDANCE',
    'FEES',
    'COMMUNICATION',
    'AI_AGENTS',
    'HIGHER_ED',
    'COACHING',
    'INTERNATIONAL',
    'MULTI_CAMPUS',
    'ENTERPRISE',
];

function displayNameFor(user: { firstName?: string | null; lastName?: string | null; email: string }): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export async function loginActionV2(formData: FormData) {
    return runWithRlsBypass(
        RLS_BYPASS_JUSTIFICATIONS.PASSWORD_LOGIN,
        () => loginActionV2WithBypass(formData),
    );
}

async function loginActionV2WithBypass(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const schoolCode = formData.get('schoolCode') as string | null;
    const mfaCode = ((formData.get('mfaCode') || formData.get('otp')) as string | null)?.trim() || undefined;

    // Validate input
    const validation = loginSchema.safeParse({ email, password, schoolCode: schoolCode || undefined, mfaCode });
    if (!validation.success) {
        return {
            error: validation.error.errors[0].message,
        };
    }

    // Consume before any account lookup or password work. Successful authentication
    // clears the bucket; every rejected authentication attempt remains counted.
    const rateLimitError = await consumeLoginRateLimit(email);
    if (rateLimitError) {
        return { error: rateLimitError };
    }

    let redirectPath = '';

    try {
        const loginMode = formData.get('loginMode') as string | null;

        // Strict architectural boundary: Only attempt platform auth if explicitly requested
        const isPlatformAdmin = loginMode === 'platform';

        if (isPlatformAdmin) {
            const normalizedEmail = email?.trim().toLowerCase() || '';

            const platformRows = await sql<{
                id: string;
                tenantId: string;
                tenantCode: string | null;
                tenantDomain: string | null;
                email: string;
                passwordHash: string;
                role: string;
                firstName: string | null;
                lastName: string | null;
                mfaEnabled: boolean | null;
            }>`
                SELECT
                    u.id,
                    u.tenant_id as "tenantId",
                    t.code as "tenantCode",
                    t.domain as "tenantDomain",
                    COALESCE(u.email_enc, u.email) AS "email",
                    u.password_hash as "passwordHash",
                    u.role,
                    u.first_name as "firstName",
                    u.last_name as "lastName",
                    u.mfa_enabled as "mfaEnabled"
                FROM users u
                LEFT JOIN tenants t ON t.id = u.tenant_id
                WHERE (u.email_enc = ANY(${encryptEmailCandidates(normalizedEmail)}::text[]) OR u.email = ${normalizedEmail}) LIMIT 1
            `;
            const user = platformRows[0];

            if (!user) {
                return { error: 'Invalid email or password' };
            }
            user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);

            if (user.role !== 'PLATFORM_ADMIN') {
                return { error: 'Invalid email or password' };
            }

            const passwordValid = await compare(password, user.passwordHash);
            if (!passwordValid) {
                return { error: 'Invalid credentials' };
            }

            if (user.mfaEnabled) {
                if (!mfaCode) {
                    return { error: 'Enter your authenticator code to continue', mfaRequired: true };
                }
                const mfaResult = await verifyMFACode(user.id, user.tenantId, mfaCode);
                if (!mfaResult.success) {
                    return { error: mfaResult.error || 'Invalid MFA code', mfaRequired: true };
                }
            }
            // An MFA-required role that has not yet enrolled is deliberately NOT
            // rejected here. It receives a restricted session — establishSession
            // leaves mfaVerified false — and is routed to /mfa/setup below, the one
            // route the proxy permits in that state, so it can enrol and then
            // use the account. Rejecting it (the old behaviour) bricked every admin
            // not born through /setup's own auto-login: enrolment needs a session,
            // and login refused to grant one, so the account could never be used.

            await clearRateLimit(email);
            const session = await getSession();
            establishSession(session, {
                userId: user.id,
                tenantId: user.tenantId,
                tenantCode: user.tenantCode || undefined,
                tenantDomain: user.tenantDomain || undefined,
                role: 'PLATFORM_ADMIN',
                email: user.email,
                provider: 'password',
                displayName: displayNameFor(user),
                subscriptionTier: 'ENTERPRISE',
                activeModules: PLATFORM_ACTIVE_MODULES,
                mfaEnabled: Boolean(user.mfaEnabled),
                mfaVerified: Boolean(user.mfaEnabled),
            });
            await session.save();

            redirectPath =
                session.mfaRequired && !session.mfaVerified ? '/mfa/setup' : '/hq';

        } else {
            // School staff login — requires school code
            if (!schoolCode) {
                return { error: 'School code is required for staff login' };
            }

            // Look up tenant by school code and join company for features
            const tenantRows = await sql<{
                tenantId: string;
                tenantCode: string | null;
                tenantDomain: string | null;
                tenantIsActive: boolean;
                companyId: string | null;
                companyIsActive: boolean | null;
                subscriptionTier: 'CORE' | 'AI_PRO' | 'ENTERPRISE' | null;
                activeModules: string[] | null;
            }>`
                SELECT 
                    t.id as "tenantId", t.code as "tenantCode", t.domain as "tenantDomain", t.is_active as "tenantIsActive",
                    c.id as "companyId", c.is_active as "companyIsActive", c.subscription_tier as "subscriptionTier", c.active_modules as "activeModules"
                FROM tenants t
                LEFT JOIN companies c ON t.company_id = c.id
                WHERE t.code = ${schoolCode.toUpperCase()} LIMIT 1
            `;
            const tenantRecord = tenantRows[0];

            if (!tenantRecord) {
                return { error: 'Invalid school code. Please check with your school administrator.' };
            }

            if (!tenantRecord.tenantIsActive || (tenantRecord.companyId && !tenantRecord.companyIsActive)) {
                return { error: 'This school account has been suspended. Contact support.' };
            }

            // Find user within this tenant
            const userRows = await sql<{
                id: string;
                email: string;
                passwordHash: string;
                role: string;
                firstName: string | null;
                lastName: string | null;
                isActive: boolean;
                mfaEnabled: boolean | null;
            }>`
                SELECT
                    id,
                    COALESCE(email_enc, email) AS "email",
                    password_hash as "passwordHash",
                    role,
                    first_name as "firstName",
                    last_name as "lastName",
                    is_active as "isActive",
                    mfa_enabled as "mfaEnabled"
                FROM users
                WHERE (email_enc = ANY(${encryptEmailCandidates(email)}::text[]) OR email = ${email}) AND tenant_id = ${tenantRecord.tenantId} LIMIT 1
            `;
            const user = userRows[0];

            if (!user) {
                return { error: 'Invalid email or password' };
            }
            user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);

            if (!user.isActive) {
                return { error: 'Your account has been deactivated. Contact your school admin.' };
            }

            const passwordValid = await compare(password, user.passwordHash);
            if (!passwordValid) {
                return { error: 'Invalid email or password' };
            }

            if (user.mfaEnabled) {
                if (!mfaCode) {
                    return { error: 'Enter your authenticator code to continue', mfaRequired: true };
                }
                const mfaResult = await verifyMFACode(user.id, tenantRecord.tenantId, mfaCode);
                if (!mfaResult.success) {
                    return { error: mfaResult.error || 'Invalid MFA code', mfaRequired: true };
                }
            }
            // An MFA-required role that has not yet enrolled is deliberately NOT
            // rejected here. It receives a restricted session — establishSession
            // leaves mfaVerified false — and is routed to /mfa/setup below, the one
            // route the proxy permits in that state, so it can enrol and then
            // use the account. Rejecting it (the old behaviour) bricked every admin
            // not born through /setup's own auto-login: enrolment needs a session,
            // and login refused to grant one, so the account could never be used.

            // Create session — clear rate limit on success
            await clearRateLimit(email);
            const session = await getSession();
            establishSession(session, {
                userId: user.id,
                tenantId: tenantRecord.tenantId,
                tenantCode: tenantRecord.tenantCode || undefined,
                tenantDomain: tenantRecord.tenantDomain || undefined,
                role: user.role,
                email: user.email,
                provider: 'password',
                displayName: displayNameFor(user),
                companyId: tenantRecord.companyId || undefined,
                subscriptionTier: tenantRecord.subscriptionTier || undefined,
                activeModules: tenantRecord.activeModules || [],
                mfaEnabled: Boolean(user.mfaEnabled),
                mfaVerified: Boolean(user.mfaEnabled),
            });
            
            await session.save();

            // Update last login
            await sql`
                UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ${user.id}
            `;

            // Route based on role — but an unenrolled MFA-required account goes to
            // enrolment first, whatever its role would otherwise land on.
            if (session.mfaRequired && !session.mfaVerified) {
                redirectPath = '/mfa/setup';
            } else if (user.role === 'PARENT') {
                redirectPath = '/overview';
            } else if (user.role === 'STUDENT') {
                redirectPath = '/profile';
            } else {
                redirectPath = '/dashboard';
            }
        }
    } catch (error) {
        console.error('[Login] Error:', error);
        return {
            error: 'An unexpected error occurred. Please try again or contact support.',
        };
    }

    if (redirectPath) {
        redirect(redirectPath);
    }
}

export async function logoutAction() {
    const session = await getSession();
    session.destroy();
    redirect('/login');
}
