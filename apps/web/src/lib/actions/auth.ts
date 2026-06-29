'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/auth/rate-limit';
import { pool } from '@/lib/db';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import type Users from '@/lib/db/types/public/Users';
import type Tenants from '@/lib/db/types/public/Tenants';
import type Companies from '@/lib/db/types/public/Companies';
import { generateSSOAuthorizationUrl, handleSSOCallback } from '@/lib/auth/enterprise';

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
});

export async function loginActionV2(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const schoolCode = formData.get('schoolCode') as string | null;

    // Validate input
    const validation = loginSchema.safeParse({ email, password, schoolCode: schoolCode || undefined });
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
                `SELECT id, tenant_id as "tenantId", email, password_hash as "passwordHash", role
                 FROM users 
                 WHERE email = $1 LIMIT 1`,
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

            await clearRateLimit(email);
            const session = await getSession();
            session.userId = user.id;
            session.tenantId = user.tenantId;
            session.role = 'PLATFORM_ADMIN';
            session.email = user.email;
            session.token = '';
            session.isLoggedIn = true;
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
                    t.id as "tenantId", t.is_active as "tenantIsActive",
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
                `SELECT id, email, password_hash as "passwordHash", role, is_active as "isActive"
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

            // Create session — clear rate limit on success
            await clearRateLimit(email);
            const session = await getSession();
            session.userId = user.id;
            session.tenantId = tenantRecord.tenantId;
            session.role = user.role;
            session.email = user.email;
            session.token = '';
            session.isLoggedIn = true;
            
            // Inject Company Context & Features
            if (tenantRecord.companyId) {
                session.companyId = tenantRecord.companyId;
                session.subscriptionTier = tenantRecord.subscriptionTier;
                session.activeModules = tenantRecord.activeModules || [];
            }
            
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
    } catch (error: any) {
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

export async function initiateSSOLogin(provider: string, redirectUri: string) {
    let url = '';
    try {
        url = await generateSSOAuthorizationUrl(provider, redirectUri);
    } catch (error) {
        console.error('[SSO] Error initiating login:', error);
        return { error: 'Failed to initiate SSO login' };
    }
    
    if (url) {
        redirect(url);
    }
}

export async function processSSOCallback(code: string, provider: string) {
    let redirectPath = '';
    try {
        const ssoResult = await handleSSOCallback(code, provider);
        if (!ssoResult.success) {
            return { error: 'SSO Login failed' };
        }
        
        const session = await getSession();
        session.userId = ssoResult.userId as any;
        session.tenantId = ssoResult.tenantId;
        session.role = ssoResult.role as any;
        session.email = ssoResult.email;
        session.isLoggedIn = true;
        await session.save();
        
        redirectPath = '/dashboard';
    } catch (error: any) {
        console.error('[SSO] Error processing callback:', error);
        return { error: 'Failed to process SSO callback' };
    }

    if (redirectPath) {
        redirect(redirectPath);
    }
}
