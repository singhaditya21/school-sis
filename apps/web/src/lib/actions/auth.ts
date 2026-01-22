'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { authApi } from '@/lib/api';
import { z } from 'zod';

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function loginAction(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // Validate input
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
        return {
            error: validation.error.errors[0].message,
        };
    }

    try {
        // Demo credentials for testing (matches constants.ts)
        const demoUsers: Record<string, { password: string; userId: string; tenantId: string; role: string; name: string }> = {
            'admin@greenwood.edu': { password: 'admin123', userId: 'demo-admin', tenantId: 'demo-tenant', role: 'SUPER_ADMIN', name: 'Admin User' },
            'accountant@greenwood.edu': { password: 'accountant123', userId: 'demo-accountant', tenantId: 'demo-tenant', role: 'ACCOUNTANT', name: 'Accountant' },
            'principal@greenwood.edu': { password: 'principal123', userId: 'demo-principal', tenantId: 'demo-tenant', role: 'PRINCIPAL', name: 'Principal' },
            'teacher@greenwood.edu': { password: 'teacher123', userId: 'demo-teacher', tenantId: 'demo-tenant', role: 'TEACHER', name: 'Teacher' },
            'parent@example.com': { password: 'parent123', userId: 'demo-parent', tenantId: 'demo-tenant', role: 'PARENT', name: 'Parent User' },
        };

        // Check demo credentials first
        const demoUser = demoUsers[email];
        if (demoUser && demoUser.password === password) {
            const session = await getSession();
            session.userId = demoUser.userId;
            session.tenantId = demoUser.tenantId;
            session.role = demoUser.role as any;
            session.email = email;
            session.token = 'demo-token-' + Date.now();
            session.isLoggedIn = true;
            await session.save();

            if (demoUser.role === 'PARENT') {
                redirect('/overview');
            } else if (demoUser.role === 'STUDENT') {
                redirect('/profile');
            } else {
                redirect('/dashboard');
            }
        }

        // Try real API if not demo user
        try {
            const response = await authApi.login({ email, password });

            if (!response.success || !response.data) {
                return {
                    error: response.error?.message || 'Invalid email or password',
                };
            }

            const { accessToken, refreshToken, userId, tenantId, role, email: userEmail, name } = response.data;

            const session = await getSession();
            session.userId = userId;
            session.tenantId = tenantId || '';
            session.role = role;
            session.email = userEmail;
            session.token = accessToken;
            session.isLoggedIn = true;
            await session.save();

            if (role === 'PARENT') {
                redirect('/overview');
            } else if (role === 'STUDENT') {
                redirect('/profile');
            } else {
                redirect('/dashboard');
            }
        } catch {
            // API not available, reject non-demo users
            return {
                error: 'Invalid email or password. Try demo: admin@school.edu / admin123',
            };
        }
    } catch (error) {
        console.error('[Login] Error:', error);

        if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
            throw error;
        }

        return {
            error: 'An error occurred during login. Please try again.',
        };
    }
}

export async function logoutAction() {
    authApi.logout();
    const session = await getSession();
    session.destroy();
    redirect('/login');
}
