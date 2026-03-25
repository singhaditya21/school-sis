// Audit Trail Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface AuditLog { id: string; userId: string; userName: string; action: string; entity: string; entityId: string; details: string; ipAddress: string; timestamp: string; }

export const AuditService = {
    async getLogs(tenantId: string, filters?: { action?: string; entity?: string; userId?: string; from?: string; to?: string }): Promise<AuditLog[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT al.id,al.user_id AS "userId",u.first_name||' '||u.last_name AS "userName",al.action,al.entity,al.entity_id AS "entityId",al.details,al.ip_address AS "ipAddress",al.created_at AS timestamp FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE al.tenant_id=${tenantId} ${filters?.action?sql`AND al.action=${filters.action}`:sql``} ${filters?.entity?sql`AND al.entity=${filters.entity}`:sql``} ${filters?.userId?sql`AND al.user_id=${filters.userId}`:sql``} ${filters?.from?sql`AND al.created_at>=${filters.from}::date`:sql``} ${filters?.to?sql`AND al.created_at<=${filters.to}::date+INTERVAL '1 day'`:sql``} ORDER BY al.created_at DESC LIMIT 200`);
        return rows as AuditLog[];
    },
    async getStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE) AS today,COUNT(DISTINCT user_id) AS "activeUsers",COUNT(DISTINCT entity) AS entities FROM audit_logs WHERE tenant_id=${tenantId}`) as any[];
        return { totalLogs: Number(s?.total||0), todayLogs: Number(s?.today||0), activeUsers: Number(s?.activeUsers||0), trackedEntities: Number(s?.entities||0) };
    },
    getActionTypes(): string[] { return ['CREATE','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','IMPORT','VIEW','APPROVE','REJECT']; },
    getEntityTypes(): string[] { return ['student','user','invoice','payment','attendance','exam','timetable','admission','document','certificate']; },
};
