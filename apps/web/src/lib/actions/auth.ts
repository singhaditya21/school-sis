'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { clearRateLimit, consumeLoginRateLimit, consumeRateLimit } from '@/lib/auth/rate-limit';
import { sql, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { verifyMFACode } from '@/lib/auth/mfa';
import { establishSession } from '@/lib/auth/identity';
import { encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { logger } from '@/lib/observability/logger';
import {
    canonicalizeEmailIdentity,
    isPermanentPlatformAdminEmail,
    normalizeWorkspaceCode,
    PLATFORM_ALL_MODULES,
    PLATFORM_HQ_TENANT_CODE,
} from '@/lib/auth/platform-owner';
import { extractTrustedClientIp } from '@/lib/security/client-ip';
import { isDemoTenantCode } from '@/lib/tenant/demo-guard';

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

const DUMMY_PASSWORD_HASH = '$2a$12$rtRIcbN90xzIGNYbZ/balew0SMhGjd38LHz8rS9D5jEx4QEvSpLEO';

async function resolveLoginClientIp(): Promise<string> {
    try {
        return extractTrustedClientIp(await headers());
    } catch {
        return 'unknown-ip';
    }
}

async function consumeAccountFailureBucket(
    tenantBucket: string,
    canonicalEmail: string,
): Promise<string | null> {
    return consumeRateLimit(`${tenantBucket}:${canonicalEmail}`, {
        scope: 'auth:login:account-fail',
        maxAttempts: 15,
        degradedMaxAttempts: 5,
        endpointClass: 'login',
        message: 'Too many failed login attempts for this account. Please try again later.',
    });
}

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

    // Pre-auth rate limit enforces per-IP and per-(IP, tenant, email) buckets so an
    // unauthenticated attacker from one IP cannot lock out a victim's global account.
    const normalizedEmailInput = email.trim().toLowerCase();
    const canonicalEmail = canonicalizeEmailIdentity(normalizedEmailInput);
    const loginMode = formData.get('loginMode') as string | null;
    const isPlatformAdmin =
        loginMode === 'platform' || isPermanentPlatformAdminEmail(normalizedEmailInput);
    const tenantRateBucket = isPlatformAdmin
        ? PLATFORM_HQ_TENANT_CODE
        : normalizeWorkspaceCode(schoolCode) || 'MISSING_CODE';

    const clientIp = await resolveLoginClientIp();
    const ipRateError = await consumeRateLimit(clientIp, {
        scope: 'auth:login:ip',
        maxAttempts: 25,
        degradedMaxAttempts: 5,
        endpointClass: 'login',
        message: 'Too many login attempts from this network. Please try again later.',
    });
    if (ipRateError) {
        return { error: ipRateError };
    }

    const ipAccountKey = `${clientIp}:${tenantRateBucket}:${canonicalEmail}`;
    const rateLimitError = await consumeLoginRateLimit(ipAccountKey);
    if (rateLimitError) {
        return { error: rateLimitError };
    }

    let redirectPath = '';

    try {
        // Permanent Platform Admin (`singhaditya21@gmail.com`) always routes to HQ
        // platform authentication, even when submitted from the default login view.
        if (isPlatformAdmin) {
            if (!isPermanentPlatformAdminEmail(normalizedEmailInput)) {
                await compare(password, DUMMY_PASSWORD_HASH);
                const failLimitError = await consumeAccountFailureBucket(
                    PLATFORM_HQ_TENANT_CODE,
                    canonicalEmail,
                );
                if (failLimitError) {
                    return { error: failLimitError };
                }
                return { error: 'Invalid email or password' };
            }

            const platformRows = await sql<{
                id: string;
                tenantId: string;
                tenantCode: string | null;
                tenantDomain: string | null;
                tenantSessionVersion?: number | null;
                email: string;
                passwordHash: string;
                role: string;
                isActive: boolean;
                firstName: string | null;
                lastName: string | null;
                mfaEnabled: boolean | null;
                sessionVersion?: number | null;
            }>`
                SELECT
                    u.id,
                    u.tenant_id as "tenantId",
                    t.code as "tenantCode",
                    t.domain as "tenantDomain",
                    t.session_version as "tenantSessionVersion",
                    COALESCE(u.email_enc, u.email) AS "email",
                    u.password_hash as "passwordHash",
                    u.role,
                    u.is_active as "isActive",
                    u.first_name as "firstName",
                    u.last_name as "lastName",
                    u.mfa_enabled as "mfaEnabled",
                    u.session_version as "sessionVersion"
                FROM users u
                INNER JOIN tenants t ON t.id = u.tenant_id
                WHERE (u.email_enc = ANY(${encryptEmailCandidates(canonicalEmail)}::text[]) OR lower(u.email) = ${canonicalEmail})
                  AND upper(t.code) = ${PLATFORM_HQ_TENANT_CODE}
                  AND t.is_active = true
                  AND u.role = 'PLATFORM_ADMIN'
                LIMIT 1
            `;
            const user = platformRows[0];

            const passwordValid = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
            if (!user || !user.isActive || user.role !== 'PLATFORM_ADMIN' || !passwordValid) {
                const failLimitError = await consumeAccountFailureBucket(
                    PLATFORM_HQ_TENANT_CODE,
                    canonicalEmail,
                );
                if (failLimitError) {
                    return { error: failLimitError };
                }
                return { error: 'Invalid email or password' };
            }
            user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);

            if (user.mfaEnabled) {
                if (!mfaCode) {
                    return { error: 'Enter your authenticator code to continue', mfaRequired: true };
                }
                const mfaResult = await verifyMFACode(user.id, user.tenantId, mfaCode);
                if (!mfaResult.success) {
                    const failLimitError = await consumeAccountFailureBucket(
                        PLATFORM_HQ_TENANT_CODE,
                        canonicalEmail,
                    );
                    if (failLimitError) {
                        return { error: failLimitError };
                    }
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

            await clearRateLimit(ipAccountKey);
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
                activeModules: [...PLATFORM_ALL_MODULES],
                mfaEnabled: Boolean(user.mfaEnabled),
                mfaVerified: Boolean(user.mfaEnabled),
            });
            session.sessionVersion = user.sessionVersion ?? 1;
            session.tenantSessionVersion = user.tenantSessionVersion ?? 1;
            session.isDemoSandbox = false;
            await session.save();

            await sql`
                UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ${user.id}
            `;

            redirectPath =
                session.mfaRequired && !session.mfaVerified ? '/mfa/setup' : '/hq';

        } else {
            // School staff login — requires school code
            const normalizedSchoolCode = normalizeWorkspaceCode(schoolCode);
            if (!normalizedSchoolCode) {
                return { error: 'School code is required for staff login' };
            }
            if (normalizedSchoolCode === PLATFORM_HQ_TENANT_CODE) {
                await compare(password, DUMMY_PASSWORD_HASH);
                return { error: 'Invalid school code. Please check with your school administrator.' };
            }

            // Look up tenant by school code and join company for features
            const tenantRows = await sql<{
                tenantId: string;
                tenantCode: string | null;
                tenantDomain: string | null;
                tenantIsActive: boolean;
                tenantSessionVersion?: number | null;
                tenantIsDemo?: boolean | null;
                companyId: string | null;
                companyIsActive: boolean | null;
                subscriptionTier: 'CORE' | 'AI_PRO' | 'ENTERPRISE' | null;
                activeModules: string[] | null;
            }>`
                SELECT 
                    t.id as "tenantId",
                    t.code as "tenantCode",
                    t.domain as "tenantDomain",
                    t.is_active as "tenantIsActive",
                    t.session_version as "tenantSessionVersion",
                    t.is_demo as "tenantIsDemo",
                    c.id as "companyId",
                    c.is_active as "companyIsActive",
                    c.subscription_tier as "subscriptionTier",
                    c.active_modules as "activeModules"
                FROM tenants t
                LEFT JOIN companies c ON t.company_id = c.id
                WHERE upper(t.code) = ${normalizedSchoolCode} LIMIT 1
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
                sessionVersion?: number | null;
            }>`
                SELECT
                    id,
                    COALESCE(email_enc, email) AS "email",
                    password_hash as "passwordHash",
                    role,
                    first_name as "firstName",
                    last_name as "lastName",
                    is_active as "isActive",
                    mfa_enabled as "mfaEnabled",
                    session_version as "sessionVersion"
                FROM users
                WHERE (email_enc = ANY(${encryptEmailCandidates(normalizedEmailInput)}::text[]) OR lower(email) = ${normalizedEmailInput}) AND tenant_id = ${tenantRecord.tenantId} LIMIT 1
            `;
            const user = userRows[0];

            const passwordValid = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
            if (!user || !passwordValid) {
                const failLimitError = await consumeAccountFailureBucket(
                    normalizedSchoolCode,
                    canonicalEmail,
                );
                if (failLimitError) {
                    return { error: failLimitError };
                }
                return { error: 'Invalid email or password' };
            }
            user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);
            if (
                (user.role === 'PLATFORM_ADMIN' && tenantRecord.tenantCode !== 'HQ') ||
                isPermanentPlatformAdminEmail(user.email)
            ) {
                return { error: 'Invalid email or password' };
            }

            if (!user.isActive) {
                return { error: 'Your account has been deactivated. Contact your school admin.' };
            }

            if (user.mfaEnabled) {
                if (!mfaCode) {
                    return { error: 'Enter your authenticator code to continue', mfaRequired: true };
                }
                const mfaResult = await verifyMFACode(user.id, tenantRecord.tenantId, mfaCode);
                if (!mfaResult.success) {
                    const failLimitError = await consumeAccountFailureBucket(
                        normalizedSchoolCode,
                        canonicalEmail,
                    );
                    if (failLimitError) {
                        return { error: failLimitError };
                    }
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
            await clearRateLimit(ipAccountKey);
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
            const demoSandbox =
                Boolean(tenantRecord.tenantIsDemo) || isDemoTenantCode(tenantRecord.tenantCode);
            session.sessionVersion = user.sessionVersion ?? 1;
            session.tenantSessionVersion = tenantRecord.tenantSessionVersion ?? 1;
            session.isDemoSandbox = demoSandbox;
            if (demoSandbox && !user.mfaEnabled) {
                session.mfaRequired = false;
                session.mfaVerified = false;
            }

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
                redirectPath = '/student';
            } else {
                redirectPath = '/dashboard';
            }
        }
    } catch (error) {
        logger.error('auth.login_failed', 'Unexpected login error', {
            source: 'auth-action',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
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
