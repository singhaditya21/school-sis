'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/auth/rate-limit';
import { db, setTenantContext } from '@/lib/db';
import { users, tenants } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { compare } from 'bcryptjs';
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

export async function loginAction(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const schoolCode = formData.get('schoolCode') as string | null;
    const loginMode = formData.get('loginMode') as string | null;

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
        // Platform Admin login — strictly locked to founder email
        if (loginMode === 'platform') {
            if (email !== 'founder@scholarmind.com') {
                await recordFailedAttempt(email);
                return { error: 'Unauthorized: Only the SaaS Founder can access the platform dashboard.' };
            }

            const [user] = await db
                .select()
                .from(users)
                .where(
                    and(
                        eq(users.email, email),
                        eq(users.role, 'SUPER_ADMIN')
                    )
                )
                .limit(1);

            if (!user) {
                await recordFailedAttempt(email);
                return { error: 'Invalid credentials or not a platform admin' };
            }

            const passwordValid = await compare(password, user.passwordHash);
            if (!passwordValid) {
                await recordFailedAttempt(email);
                return { error: 'Invalid credentials' };
            }

            // Platform admins get full access
            await clearRateLimit(email);
            const session = await getSession();
            session.userId = user.id;
            session.tenantId = user.tenantId;
            session.role = 'PLATFORM_ADMIN';
            session.email = user.email;
            session.token = '';
            session.isLoggedIn = true;
            await session.save();

            redirectPath = '/platform';

        } else {
            // School staff login — requires school code
            if (!schoolCode) {
                return { error: 'School code is required for staff login' };
            }

            // Look up tenant by school code
            const [tenant] = await db
                .select()
                .from(tenants)
                .where(eq(tenants.code, schoolCode.toUpperCase()))
                .limit(1);

            if (!tenant) {
                return { error: 'Invalid school code. Please check with your school administrator.' };
            }

            if (!tenant.isActive) {
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
    } catch (error) {
        console.error('[Login] Error:', error);
        return {
            error: 'An error occurred during login. Please try again.',
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
