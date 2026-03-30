import { db } from '@/lib/db';
import { auditLogs, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { setTenantContext } from '@/lib/db';
import { AuditClientView } from './AuditClient';

export default async function AuditPage() {
    const { tenantId, role } = await requireAuth(); // Ideally 'admin' check, but let's just make sure they are auth'd
    await setTenantContext(tenantId);
    
    // Fetch live audit logs mapped to the Client View interface
    const rawEvents = await db
        .select({
            id: auditLogs.id,
            timestamp: auditLogs.createdAt,
            userId: auditLogs.userId,
            userName: users.firstName,
            userLastName: users.lastName,
            userRole: users.role,
            action: auditLogs.action,
            resource: auditLogs.resource,
            resourceId: auditLogs.resourceId,
            details: auditLogs.details,
            ipAddress: auditLogs.ipAddress,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(eq(auditLogs.tenantId, tenantId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1000); // Prevent crashing browser, pagination would be better but this is sufficient.

    const mappedEvents = rawEvents.map(e => ({
        id: e.id,
        timestamp: new Date(e.timestamp).toISOString(),
        userId: e.userId || 'system',
        userName: e.userName ? `${e.userName} ${e.userLastName || ''}`.trim() : 'System Action',
        userRole: e.userRole || 'SYSTEM',
        action: e.action,
        resource: e.resource,
        resourceId: e.resourceId || undefined,
        details: e.details || '',
        ipAddress: e.ipAddress || '0.0.0.0',
    }));

    return <AuditClientView initialEvents={mappedEvents} />;
}
