'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function getAppointments(): Promise<any[]> {
    const { tenantId } = await requireAuth('appointments:read');
    const { rows } = await pool.query(`
        SELECT a.id, a.title, a.description, a.date, a.time, a.duration,
               u.first_name||' '||u.last_name AS "with", a.status, a.type
        FROM appointments a LEFT JOIN users u ON u.id = a.with_user_id
        WHERE a.tenant_id = $1 ORDER BY a.date DESC, a.time DESC LIMIT 50
    `, [tenantId]);
    return rows;
}
