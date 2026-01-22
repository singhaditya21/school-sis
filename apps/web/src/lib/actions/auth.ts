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
        // Call Java API for authentication
        const response = await authApi.login({ email, password });

        if (!response.success || !response.data) {
            return {
                error: response.error?.message || 'Invalid email or password',
            };
        }

        const { accessToken, refreshToken, userId, tenantId, role, email: userEmail, name } = response.data;

        // Create session with JWT token
        const session = await getSession();
        session.userId = userId;
        session.tenantId = tenantId || '';
        session.role = role;
        session.email = userEmail;
        session.token = accessToken;
        session.isLoggedIn = true;
        await session.save();

        // Redirect based on role
        if (role === 'PARENT') {
            redirect('/overview');
        } else if (role === 'STUDENT') {
            redirect('/profile');
        } else {
            redirect('/dashboard');
        }
    } catch (error) {
        console.error('[Login] Error:', error);

        // Check if it's a redirect (which throws in Next.js)
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
