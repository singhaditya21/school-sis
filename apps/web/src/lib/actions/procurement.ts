'use server';

import { db } from '@/lib/db';
import { platformAuditLogs } from '@/lib/db/schema/platform';
import { getSession } from '@/lib/auth/session';
import { eq, desc } from 'drizzle-orm';

/**
 * Fetch the Trust & Evidence operations log (Module 43)
 */
export async function getEvidenceLogAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    // In a production tenant-isolation model, we would strictly index
    // user-specific platform logs.
    const logs = await db
        .select()
        .from(platformAuditLogs)
        .where(eq(platformAuditLogs.targetTenantId, session.tenantId))
        .orderBy(desc(platformAuditLogs.createdAt))
        .limit(50);

    return logs;
}
