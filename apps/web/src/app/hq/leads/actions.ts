'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';

export interface LeadActionResult {
    success: boolean;
    error?: string;
}

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CLOSED'] as const;

export async function updateLeadStatusAction(input: {
    leadId: string;
    status: string;
}): Promise<LeadActionResult> {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    if (!input.leadId) {
        return { success: false, error: 'Missing lead.' };
    }
    if (!LEAD_STATUSES.includes(input.status as (typeof LEAD_STATUSES)[number])) {
        return { success: false, error: 'Unknown lead status.' };
    }

    const { rowCount } = await pool.query(
        `UPDATE marketing_leads SET status = $1 WHERE id = $2`,
        [input.status, input.leadId],
    );

    if (!rowCount) {
        return { success: false, error: 'That lead no longer exists.' };
    }

    revalidatePath('/hq/leads');

    return { success: true };
}
