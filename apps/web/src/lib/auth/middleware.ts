'use server';

import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { redirect } from 'next/navigation';

/**
 * Server-side auth middleware for Server Actions.
 * Validates session + RBAC permissions before executing any action.
 * 
 * Usage:
 *   const { session, tenantId } = await requireAuth('fees:read');
 */

export interface AuthContext {
    session: {
        userId: string;
        tenantId: string;
        role: string;
        email: string;
    };
    tenantId: string;
    userId: string;
}

/**
 * Require authentication. Redirects to login if not authenticated.
 * Optionally checks a specific permission.
 */
export async function requireAuth(permission?: string): Promise<AuthContext> {
    const session = await getSession();

    if (!session.isLoggedIn || !session.userId) {
        redirect('/login');
    }

    if (!session.tenantId) {
        throw new Error('Session missing tenantId. This should not happen.');
    }

    // Check permission if specified
    if (permission) {
        const role = session.role as UserRole;
        if (!hasPermission(role, permission)) {
            throw new Error(`Forbidden: insufficient permissions for ${permission}`);
        }
    }

    return {
        session: {
            userId: session.userId,
            tenantId: session.tenantId,
            role: session.role,
            email: session.email,
        },
        tenantId: session.tenantId,
        userId: session.userId,
    };
}

/**
 * Require a specific role. Throws if role doesn't match.
 */
export async function requireRole(...roles: UserRole[]): Promise<AuthContext> {
    const auth = await requireAuth();

    if (!roles.includes(auth.session.role as UserRole)) {
        throw new Error(`Forbidden: requires one of [${roles.join(', ')}]`);
    }

    return auth;
}
