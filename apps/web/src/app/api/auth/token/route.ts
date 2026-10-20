import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { clearRateLimit, consumeLoginRateLimit } from '@/lib/auth/rate-limit';
import { verifyMFACode } from '@/lib/auth/mfa';
import { establishSession } from '@/lib/auth/identity';
import { sql, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';

export const dynamic = "force-dynamic";

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
        const rateLimitError = await consumeLoginRateLimit(email);
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
                    WHERE (email_enc = ANY(${encryptEmailCandidates(email)}::text[]) OR email = ${email})
                      AND tenant_id = ${tenantRecord.tenantId}
                    LIMIT 1
                `;
                const user = userRows[0];
                if (!user || !user.isActive) {
                    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
                }

                user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);

                const passwordValid = await compare(password, user.passwordHash);
                if (!passwordValid) {
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
                        return NextResponse.json(
                            { error: mfaResult.error || 'Invalid MFA code', mfaRequired: true },
                            { status: 401 },
                        );
                    }
                }

                await clearRateLimit(email);
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
                });
            },
        );
    } catch (error) {
        console.error('Mobile token auth error:', error);
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
