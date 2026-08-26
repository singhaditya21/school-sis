'use server';

import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { impersonateTenantAction, toggleTenantStatusAction } from '@/lib/actions/platform';

/**
 * Flat wrappers around the platform tenant controls.
 *
 * The underlying actions return discriminated shapes; Next.js erases union
 * narrowing across the 'use server' boundary, so the HQ client components
 * consume the flattened result declared here instead.
 */
export interface TenantControlResult {
    success: boolean;
    error?: string;
    redirectTo?: string;
}

export async function suspendCampusAction(input: {
    tenantId: string;
    isActive: boolean;
}): Promise<TenantControlResult> {
    await requireRole(UserRole.PLATFORM_ADMIN);

    if (!input.tenantId) {
        return { success: false, error: 'Missing campus.' };
    }

    await toggleTenantStatusAction(input.tenantId, input.isActive);

    return { success: true };
}

export async function startImpersonationAction(tenantId: string): Promise<TenantControlResult> {
    await requireRole(UserRole.PLATFORM_ADMIN);

    if (!tenantId) {
        return { success: false, error: 'Missing campus.' };
    }

    const result = await impersonateTenantAction(tenantId);

    if ('error' in result && result.error) {
        return { success: false, error: result.error };
    }

    return { success: true, redirectTo: '/dashboard' };
}
