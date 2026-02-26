'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { compare } from 'bcryptjs';
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
        // Query real database for user
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        if (!user) {
            return { error: 'Invalid email or password' };
        }

        if (!user.isActive) {
            return { error: 'Account is deactivated. Contact your administrator.' };
        }

        // Verify password with bcrypt
        const isValidPassword = await compare(password, user.passwordHash);
        if (!isValidPassword) {
            return { error: 'Invalid email or password' };
        }

        // Update last login timestamp
        await db
            .update(users)
            .set({ lastLoginAt: new Date() })
            .where(eq(users.id, user.id));

        // Create session
        const session = await getSession();
        session.userId = user.id;
        session.tenantId = user.tenantId;
        session.role = user.role;
        session.email = user.email;
        session.token = ''; // No JWT needed — session is the auth
        session.isLoggedIn = true;
        await session.save();

        // Redirect based on role
        if (user.role === 'PARENT') {
            redirect('/overview');
        } else if (user.role === 'STUDENT') {
            redirect('/profile');
        } else {
            redirect('/dashboard');
        }
    } catch (error) {
        // Re-throw Next.js redirects
        if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
            throw error;
        }

        console.error('[Login] Error:', error);
        return {
            error: 'An error occurred during login. Please try again.',
        };
    }
}

export async function logoutAction() {
    const session = await getSession();
    session.destroy();
    redirect('/login');
}
