'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/auth/rate-limit';
import { pool, runWithRlsBypass } from '@/lib/db';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { generateSSOAuthorizationUrl, handleSSOCallback } from '@/lib/auth/enterprise';
import { verifyMFACode } from '@/lib/auth/mfa';
import { establishSession, shouldRequireMfaEnrollment } from '@/lib/auth/identity';

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
    return runWithRlsBypass(() => loginActionV2WithBypass(formData));
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

    // Rate limiting — 5 failed attempts per email in 15 minutes
    const rateLimitError = await checkRateLimit(email);
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

            const { rows: platformRows } = await pool.query(
                `SELECT
                    u.id,
                    u.tenant_id as "tenantId",
                    t.code as "tenantCode",
                    t.domain as "tenantDomain",
                    u.email,
                    u.password_hash as "passwordHash",
                    u.role,
                    u.first_name as "firstName",
                    u.last_name as "lastName",
                    u.mfa_enabled as "mfaEnabled"
                 FROM users u
                 LEFT JOIN tenants t ON t.id = u.tenant_id
                 WHERE u.email = $1 LIMIT 1`,
                [normalizedEmail]
            );
            const user = platformRows[0];

            if (!user) {
                await recordFailedAttempt(email);
                return { error: 'Invalid email or password' };
            }

            if (user.role !== 'PLATFORM_ADMIN') {
                await recordFailedAttempt(email);
                return { error: 'Invalid email or password' };
            }

            const passwordValid = await compare(password, user.passwordHash);
            if (!passwordValid) {
                await recordFailedAttempt(email);
                return { error: 'Invalid credentials' };
            }

            if (user.mfaEnabled) {
                if (!mfaCode) {
                    return { error: 'Enter your authenticator code to continue', mfaRequired: true };
                }
                const mfaResult = await verifyMFACode(user.id, user.tenantId, mfaCode);
                if (!mfaResult.success) {
                    await recordFailedAttempt(email);
                    return { error: mfaResult.error || 'Invalid MFA code', mfaRequired: true };
                }
            } else if (shouldRequireMfaEnrollment(user.role, Boolean(user.mfaEnabled))) {
                return { error: 'MFA enrollment is required for this account before login.' };
            }

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

            redirectPath = '/hq';

        } else {
            // School staff login — requires school code
            if (!schoolCode) {
                return { error: 'School code is required for staff login' };
            }

            // Look up tenant by school code and join company for features
            const { rows: tenantRows } = await pool.query(
                `SELECT 
                    t.id as "tenantId", t.code as "tenantCode", t.domain as "tenantDomain", t.is_active as "tenantIsActive",
                    c.id as "companyId", c.is_active as "companyIsActive", c.subscription_tier as "subscriptionTier", c.active_modules as "activeModules"
                 FROM tenants t
                 LEFT JOIN companies c ON t.company_id = c.id
                 WHERE t.code = $1 LIMIT 1`,
                [schoolCode.toUpperCase()]
            );
            const tenantRecord = tenantRows[0];

            if (!tenantRecord) {
                return { error: 'Invalid school code. Please check with your school administrator.' };
            }

            if (!tenantRecord.tenantIsActive || (tenantRecord.companyId && !tenantRecord.companyIsActive)) {
                return { error: 'This school account has been suspended. Contact support.' };
            }

            // Find user within this tenant
            const { rows: userRows } = await pool.query(
                `SELECT
                    id,
                    email,
                    password_hash as "passwordHash",
                    role,
                    first_name as "firstName",
                    last_name as "lastName",
                    is_active as "isActive",
                    mfa_enabled as "mfaEnabled"
                 FROM users 
                 WHERE email = $1 AND tenant_id = $2 LIMIT 1`,
                [email, tenantRecord.tenantId]
            );
            const user = userRows[0];

            if (!user) {
                await recordFailedAttempt(email);
                return { error: 'Invalid email or password' };
            }

            if (!user.isActive) {
                await recordFailedAttempt(email);
                return { error: 'Your account has been deactivated. Contact your school admin.' };
            }

            const passwordValid = await compare(password, user.passwordHash);
            if (!passwordValid) {
                await recordFailedAttempt(email);
                return { error: 'Invalid email or password' };
            }

            if (user.mfaEnabled) {
                if (!mfaCode) {
                    return { error: 'Enter your authenticator code to continue', mfaRequired: true };
                }
                const mfaResult = await verifyMFACode(user.id, tenantRecord.tenantId, mfaCode);
                if (!mfaResult.success) {
                    await recordFailedAttempt(email);
                    return { error: mfaResult.error || 'Invalid MFA code', mfaRequired: true };
                }
            } else if (shouldRequireMfaEnrollment(user.role, Boolean(user.mfaEnabled))) {
                return { error: 'MFA enrollment is required for this account before login.' };
            }

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
                subscriptionTier: tenantRecord.subscriptionTier,
                activeModules: tenantRecord.activeModules || [],
                mfaEnabled: Boolean(user.mfaEnabled),
                mfaVerified: Boolean(user.mfaEnabled),
            });
            
            await session.save();

            // Update last login
            await pool.query(
                `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [user.id]
            );

            // Route based on role
            if (user.role === 'PARENT') {
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

function ssoStateExpiresAt(): string {
    return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}

export async function initiateSSOLogin(provider: string, redirectUri: string) {
    let url = '';
    try {
        const session = await getSession();
        const state = crypto.randomBytes(24).toString('base64url');
        session.ssoState = {
            value: state,
            provider,
            redirectUri,
            expiresAt: ssoStateExpiresAt(),
        };
        await session.save();

        url = await generateSSOAuthorizationUrl(provider, redirectUri, state);
    } catch (error) {
        console.error('[SSO] Error initiating login:', error);
        return { error: 'Failed to initiate SSO login' };
    }
    
    if (url) {
        redirect(url);
    }
}

export async function processSSOCallback(code: string, provider: string, state?: string) {
    let redirectPath = '';
    try {
        const session = await getSession();
        const expectedState = session.ssoState;
        if (!expectedState || expectedState.provider !== provider || expectedState.value !== state) {
            return { error: 'Invalid SSO login state. Please start sign-in again.' };
        }
        if (Date.parse(expectedState.expiresAt) <= Date.now()) {
            session.ssoState = undefined;
            await session.save();
            return { error: 'SSO login expired. Please start sign-in again.' };
        }

        const ssoResult = await handleSSOCallback(code, provider, expectedState.redirectUri);
        if (ssoResult.success === false) {
            return { error: ssoResult.error || 'SSO Login failed' };
        }
        
        establishSession(session, {
            userId: ssoResult.userId,
            tenantId: ssoResult.tenantId,
            tenantCode: ssoResult.tenantCode,
            tenantDomain: ssoResult.tenantDomain,
            role: ssoResult.role,
            email: ssoResult.email,
            provider: 'sso',
            displayName: ssoResult.displayName,
            companyId: ssoResult.companyId,
            subscriptionTier: ssoResult.subscriptionTier,
            activeModules: ssoResult.activeModules,
            mfaEnabled: ssoResult.mfaEnabled,
            mfaVerified: ssoResult.mfaVerified,
        });
        session.ssoState = undefined;
        await session.save();
        
        redirectPath = '/dashboard';
    } catch (error) {
        console.error('[SSO] Error processing callback:', error);
        return { error: 'Failed to process SSO callback' };
    }

    if (redirectPath) {
        redirect(redirectPath);
    }
}
