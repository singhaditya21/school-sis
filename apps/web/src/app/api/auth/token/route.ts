import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { isRoleMfaRequired } from '@/lib/auth/session-options';
import { isSessionStateActive } from '@/lib/auth/session-revocation';
import { clearRateLimit, consumeLoginRateLimit, consumeRateLimit } from '@/lib/auth/rate-limit';
import { verifyMFACode } from '@/lib/auth/mfa';
import { establishSession, shouldRequireMfaEnrollment } from '@/lib/auth/identity';
import {
    canonicalizeEmailIdentity,
    isPermanentPlatformAdminEmail,
    PLATFORM_HQ_TENANT_CODE,
} from '@/lib/auth/platform-owner';
import { assertSameOriginMutation, extractTrustedClientIp } from '@/lib/security/client-ip';
import { isDemoTenantCode } from '@/lib/tenant/demo-guard';
import { sql, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const DUMMY_PASSWORD_HASH = '$2a$12$rtRIcbN90xzIGNYbZ/balew0SMhGjd38LHz8rS9D5jEx4QEvSpLEO';

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

const mobileLoginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    schoolCode: z.string().min(1, 'School code is required'),
    mfaCode: z.string().optional(),
});

/**
 * GET /api/auth/token
 * Returns non-sensitive session context for client-side API calls.
 */
export async function GET() {
    const session = await getSession();

    if (!session.isLoggedIn || !(await isSessionStateActive(session))) {
        try {
            session.destroy();
        } catch {
            // Ignore cookie mutation errors in read-only contexts.
        }
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        email: session.email,
        authProvider: session.authProvider,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        mfaRequired: Boolean(session.mfaRequired),
        mfaVerified: Boolean(session.mfaVerified),
        impersonating: Boolean(session.impersonation?.actorUserId) || session.token?.startsWith('impersonating:'),
    });
}

/**
 * POST /api/auth/token
 * Authenticates a mobile or API client with schoolCode + email + password (+ optional mfaCode)
 * and establishes a signed session cookie.
 */
export async function POST(req: Request) {
    try {
        if (
            req.headers.get('cookie') ||
            req.headers.get('origin') ||
            req.headers.get('referer') ||
            req.headers.get('sec-fetch-site')
        ) {
            const csrfError = assertSameOriginMutation(req);
            if (csrfError) {
                return csrfError;
            }
        }

        const contentType = req.headers.get('content-type')?.toLowerCase() || '';
        if (!contentType.includes('application/json')) {
            return NextResponse.json(
                { error: 'Content-Type must be application/json' },
                { status: 415 },
            );
        }

        const body = await req.json().catch(() => ({}));
        const parsed = mobileLoginSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.errors[0]?.message || 'Invalid credentials payload' },
                { status: 400 },
            );
        }

        const { email, password, schoolCode, mfaCode } = parsed.data;
        const normalizedEmail = email.trim().toLowerCase();
        const canonicalEmail = canonicalizeEmailIdentity(normalizedEmail);
        const normalizedSchoolCode = schoolCode.trim().toUpperCase();
        const clientIp = extractTrustedClientIp(req.headers);

        const ipRateLimitError = await consumeRateLimit(clientIp, {
            scope: 'auth:login:ip',
            maxAttempts: 25,
            degradedMaxAttempts: 5,
            endpointClass: 'login',
            message: 'Too many login attempts from this network. Please try again later.',
        });
        if (ipRateLimitError) {
            return NextResponse.json({ error: ipRateLimitError }, { status: 429 });
        }

        const ipAccountKey = `${clientIp}:${normalizedSchoolCode}:${canonicalEmail}`;
        const rateLimitError = await consumeLoginRateLimit(ipAccountKey);
        if (rateLimitError) {
            return NextResponse.json({ error: rateLimitError }, { status: 429 });
        }

        // Enforce strict founder <-> HQ workspace isolation before & during authentication
        if (
            isPermanentPlatformAdminEmail(normalizedEmail) &&
            normalizedSchoolCode !== PLATFORM_HQ_TENANT_CODE
        ) {
            await compare(password, DUMMY_PASSWORD_HASH);
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }
        if (
            normalizedSchoolCode === PLATFORM_HQ_TENANT_CODE &&
            !isPermanentPlatformAdminEmail(normalizedEmail)
        ) {
            await compare(password, DUMMY_PASSWORD_HASH);
            const failErr = await consumeAccountFailureBucket(normalizedSchoolCode, canonicalEmail);
            if (failErr) return NextResponse.json({ error: failErr }, { status: 429 });
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        return await runWithRlsBypass(
            RLS_BYPASS_JUSTIFICATIONS.PASSWORD_LOGIN,
            async () => {
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
                    WHERE upper(t.code) = ${normalizedSchoolCode}
                    LIMIT 1
                `;
                const tenantRecord = tenantRows[0];
                if (!tenantRecord || !tenantRecord.tenantIsActive || (tenantRecord.companyId && !tenantRecord.companyIsActive)) {
                    return NextResponse.json({ error: 'Invalid school code or inactive school.' }, { status: 401 });
                }

                const lookupEmail =
                    normalizedSchoolCode === PLATFORM_HQ_TENANT_CODE ? canonicalEmail : normalizedEmail;
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
                    WHERE (email_enc = ANY(${encryptEmailCandidates(lookupEmail)}::text[]) OR lower(email) = ${lookupEmail})
                      AND tenant_id = ${tenantRecord.tenantId}
                    LIMIT 1
                `;
                const user = userRows[0];
                const passwordValid = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
                if (!user || !user.isActive || !passwordValid) {
                    const failErr = await consumeAccountFailureBucket(normalizedSchoolCode, canonicalEmail);
                    if (failErr) return NextResponse.json({ error: failErr }, { status: 429 });
                    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
                }

                user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);
                if (
                    (user.role === 'PLATFORM_ADMIN' && tenantRecord.tenantCode !== PLATFORM_HQ_TENANT_CODE) ||
                    (tenantRecord.tenantCode !== PLATFORM_HQ_TENANT_CODE && isPermanentPlatformAdminEmail(user.email))
                ) {
                    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
                }

                if (user.mfaEnabled) {
                    if (!mfaCode) {
                        return NextResponse.json(
                            { error: 'Enter your authenticator code to continue', mfaRequired: true },
                            { status: 401 },
                        );
                    }
                    const mfaResult = await verifyMFACode(user.id, tenantRecord.tenantId, mfaCode);
                    if (!mfaResult.success) {
                        const failErr = await consumeAccountFailureBucket(normalizedSchoolCode, canonicalEmail);
                        if (failErr) return NextResponse.json({ error: failErr }, { status: 429 });
                        return NextResponse.json(
                            { error: mfaResult.error || 'Invalid MFA code', mfaRequired: true },
                            { status: 401 },
                        );
                    }
                }

                await clearRateLimit(ipAccountKey);
                await sql`
                    UPDATE users
                    SET last_login_at = CURRENT_TIMESTAMP
                    WHERE id = ${user.id} AND tenant_id = ${tenantRecord.tenantId}
                `.execute();

                const session = await getSession();
                const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
                const demoSandbox =
                    Boolean(tenantRecord.tenantIsDemo) || isDemoTenantCode(tenantRecord.tenantCode);

                establishSession(session, {
                    userId: user.id,
                    tenantId: tenantRecord.tenantId,
                    tenantCode: tenantRecord.tenantCode || undefined,
                    tenantDomain: tenantRecord.tenantDomain || undefined,
                    role: user.role,
                    email: user.email,
                    provider: 'password',
                    displayName,
                    companyId: tenantRecord.companyId || undefined,
                    subscriptionTier: tenantRecord.subscriptionTier || undefined,
                    activeModules: tenantRecord.activeModules || [],
                    mfaEnabled: Boolean(user.mfaEnabled),
                    mfaVerified: Boolean(user.mfaEnabled),
                });
                session.sessionVersion = user.sessionVersion ?? 1;
                session.tenantSessionVersion = tenantRecord.tenantSessionVersion ?? 1;
                session.isDemoSandbox = demoSandbox;
                if (demoSandbox && !user.mfaEnabled) {
                    session.mfaRequired = false;
                    session.mfaVerified = false;
                }
                await session.save();

                const mfaSetupRequired =
                    isRoleMfaRequired(user.role, {
                        isDemoSandbox: demoSandbox,
                        tenantCode: tenantRecord.tenantCode,
                    }) && shouldRequireMfaEnrollment(user.role, Boolean(user.mfaEnabled));

                return NextResponse.json({
                    authenticated: true,
                    userId: session.userId,
                    tenantId: session.tenantId,
                    role: session.role,
                    email: session.email,
                    displayName,
                    mfaSetupRequired,
                });
            },
        );
    } catch (error) {
        logger.error('auth.token_failed', 'Mobile token auth error', {
            source: 'auth-token-api',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
