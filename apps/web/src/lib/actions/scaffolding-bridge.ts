'use server';

import { requireAuth } from '@/lib/auth/middleware';

export async function getTenantId(): Promise<string> {
    const { tenantId } = await requireAuth();
    return tenantId;
}
