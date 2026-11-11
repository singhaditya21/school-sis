import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { clearRateLimit, consumeLoginRateLimit, consumeRateLimit } from '@/lib/auth/rate-limit';
import { verifyMFACode } from '@/lib/auth/mfa';
import { establishSession, shouldRequireMfaEnrollment } from '@/lib/auth/identity';
import { sql, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { logger } from '@/lib/observability/logger';

export const dynamic = "force-dynamic";

const DUMMY_PASSWORD_HASH = '$2a$12$rtRIcbN90xzIGNYbZ/balew0SMhGjd38LHz8rS9D5jEx4QEvSpLEO';

function extractClientIp(req: Request): string | null {
    const raw =
        req.headers.get('x-vercel-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        req.headers.get('x-forwarded-for');
    return raw?.split(',')[0]?.trim() || null;
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

    if (!session.isLoggedIn) {
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
        const clientIp = extractClientIp(req);
        if (clientIp) {
            const ipRateLimitError = await consumeRateLimit(clientIp, {
                scope: 'login_ip',
                maxAttempts: 25,
                degradedMaxAttempts: 5,
                endpointClass: 'login',
                message: 'Too many login attempts from this network. Please try again later.',
            });
            if (ipRateLimitError) {
                return NextResponse.json({ error: ipRateLimitError }, { status: 429 });
            }
        }
        const rateLimitError = await consumeLoginRateLimit(normalizedEmail);
        if (rateLimitError) {
            return NextResponse.json({ error: rateLimitError }, { status: 429 });
        }

        return await runWithRlsBypass(
            RLS_BYPASS_JUSTIFICATIONS.PASSWORD_LOGIN,
            async () => {
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
                        t.id as "tenantId",
                        t.code as "tenantCode",
                        t.domain as "tenantDomain",
                        t.is_active as "tenantIsActive",
                        c.id as "companyId",
                        c.is_active as "companyIsActive",
                        c.subscription_tier as "subscriptionTier",
                        c.active_modules as "activeModules"
                    FROM tenants t
                    LEFT JOIN companies c ON t.company_id = c.id
                    WHERE t.code = ${schoolCode.trim().toUpperCase()}
                    LIMIT 1
                `;
                const tenantRecord = tenantRows[0];
                if (!tenantRecord || !tenantRecord.tenantIsActive || (tenantRecord.companyId && !tenantRecord.companyIsActive)) {
                    return NextResponse.json({ error: 'Invalid school code or inactive school.' }, { status: 401 });
                }

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
                    WHERE (email_enc = ANY(${encryptEmailCandidates(normalizedEmail)}::text[]) OR email = ${normalizedEmail})
                      AND tenant_id = ${tenantRecord.tenantId}
                    LIMIT 1
                `;
                const user = userRows[0];
                const passwordValid = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
                if (!user || !user.isActive || !passwordValid) {
                    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
                }
                if (user.role === 'PLATFORM_ADMIN' && tenantRecord.tenantCode !== 'HQ') {
                    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
                }

                user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);

                if (user.mfaEnabled) {
                    if (!mfaCode) {
                        return NextResponse.json(
                            { error: 'Enter your authenticator code to continue', mfaRequired: true },
                            { status: 401 },
                        );
                    }
                    const mfaResult = await verifyMFACode(user.id, tenantRecord.tenantId, mfaCode);
                    if (!mfaResult.success) {
                        return NextResponse.json(
                            { error: mfaResult.error || 'Invalid MFA code', mfaRequired: true },
                            { status: 401 },
                        );
                    }
                }

                await clearRateLimit(normalizedEmail);
                await sql`
                    UPDATE users
                    SET last_login_at = CURRENT_TIMESTAMP
                    WHERE id = ${user.id} AND tenant_id = ${tenantRecord.tenantId}
                `.execute();

                const session = await getSession();
                const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

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
                await session.save();

                return NextResponse.json({
                    authenticated: true,
                    userId: session.userId,
                    tenantId: session.tenantId,
                    role: session.role,
                    email: session.email,
                    displayName,
                    mfaSetupRequired: shouldRequireMfaEnrollment(user.role, Boolean(user.mfaEnabled)),
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
