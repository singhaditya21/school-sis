'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/auth/rate-limit';
import { db, setTenantContext } from '@/lib/db';
import { users, tenants, companies } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';

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

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, normalizedEmail))
                .limit(1);

            if (!user) {
                await recordFailedAttempt(email);
                return { error: 'Platform admin account not found in database.' };
            }

            if (user.role !== 'SUPER_ADMIN') {
                await recordFailedAttempt(email);
                return { error: 'Platform admin account not found or invalid privileges.' };
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
            const [tenantRecord] = await db
                .select({
                    tenant: tenants,
                    company: companies
                })
                .from(tenants)
                .leftJoin(companies, eq(tenants.companyId, companies.id))
                .where(eq(tenants.code, schoolCode.toUpperCase()))
                .limit(1);

            if (!tenantRecord || !tenantRecord.tenant) {
                return { error: 'Invalid school code. Please check with your school administrator.' };
            }

            const tenant = tenantRecord.tenant;
            const company = tenantRecord.company;

            if (!tenant.isActive || (company && !company.isActive)) {
                return { error: 'This school account has been suspended. Contact support.' };
            }

            // Find user within this tenant
            const [user] = await db
                .select()
                .from(users)
                .where(
                    and(
                        eq(users.email, email),
                        eq(users.tenantId, tenant.id)
                    )
                )
                .limit(1);

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
            session.tenantId = tenant.id;
            session.role = user.role;
            session.email = user.email;
            session.token = '';
            session.isLoggedIn = true;
            
            // Inject Company Context & Features
            if (company) {
                session.companyId = company.id;
                session.subscriptionTier = company.subscriptionTier;
                session.activeModules = company.activeModules || [];
            }
            
            await session.save();

            // Update last login
            await db.update(users)
                .set({ lastLoginAt: new Date() })
                .where(eq(users.id, user.id));

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
            // Expose the raw error message to diagnose Render crash
            error: `System Error: ${error.message || 'Unknown exception'}. Please screenshot this.`,
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
