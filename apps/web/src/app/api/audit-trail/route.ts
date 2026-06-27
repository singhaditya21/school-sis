import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export const dynamic = "force-dynamic";

/**
 * Audit Trail API
 *
 * GET /api/audit-trail — Query audit logs with filters.
 *
 * Auth: Admin+ only.
 * Tenant-scoped: Only returns logs for the current tenant.
 */

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view audit logs
    const adminRoles = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'PLATFORM_ADMIN'];
    if (!adminRoles.includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
    }

    const tenantId = session.tenantId;
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '7'), 90);
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');

    try {
        const params: any[] = [tenantId, days];
        let actionClause = '';
        if (action) {
            params.push(action);
            actionClause = `AND al.action = $${params.length}`;
        }

        let entityClause = '';
        if (entityType) {
            params.push(entityType);
            entityClause = `AND al.entity_type = $${params.length}`;
        }

        const { rows: data } = await pool.query(`
            SELECT al.id, al.action, al.entity_type AS "entityType",
                   al.entity_id AS "entityId", al.user_id AS "userId",
                   COALESCE(u.first_name || ' ' || u.last_name, 'System') AS "userName",
                   COALESCE(u.role, 'SYSTEM') AS role,
                   al.ip_address AS "ipAddress",
                   al.created_at AS "createdAt",
                   al.metadata
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.user_id
            WHERE al.tenant_id = $1
              AND al.created_at >= CURRENT_DATE - $2::integer
              ${actionClause}
              ${entityClause}
            ORDER BY al.created_at DESC
            LIMIT 500
        `, params);

        return NextResponse.json({ logs: data, total: data.length });
    } catch (error: any) {
        console.error('[Audit Trail] Error:', error.message);
        return NextResponse.json({ logs: [], total: 0, error: 'Failed to fetch audit logs' });
    }
}
