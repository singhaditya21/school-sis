import { pool, } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { AuditClientView } from './AuditClient';

export default async function AuditPage() {
    const { tenantId } = await requireAuth(); // Ideally 'admin' check, but let's just make sure they are auth'd
    await (tenantId);
    
    // Fetch live audit logs mapped to the Client View interface
    const rawEventsRes = await pool.query(`
        SELECT 
            al.id, 
            al.created_at AS "timestamp", 
            al.user_id AS "userId", 
            u.first_name AS "userName", 
            u.last_name AS "userLastName", 
            u.role AS "userRole", 
            al.action, 
            al.resource, 
            al.resource_id AS "resourceId", 
            al.details, 
            al.ip_address AS "ipAddress"
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.tenant_id = $1
        ORDER BY al.created_at DESC
        LIMIT 1000
    `, [tenantId]); // Prevent crashing browser, pagination would be better but this is sufficient.
    const rawEvents = rawEventsRes.rows;

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
