'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

async function tid() { const s = await getSession(); return s.tenantId; }

export async function getTenantId(): Promise<string> { return tid(); }

export async function getMessageTemplates() {
    const tenantId = await tid();
    const { rows } = await pool.query(`
        SELECT id, name, subject, body, type, variables, created_at AS "createdAt"
        FROM message_templates WHERE tenant_id = $1 ORDER BY name
    `, [tenantId]);
    return rows;
}
