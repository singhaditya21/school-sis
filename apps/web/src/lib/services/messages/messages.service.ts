'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export interface MessageTemplate {
    id: string;
    name: string;
    subject: string | null;
    body: string;
    type: string;
    variables: Record<string, string> | null;
    createdAt: string;
}

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
    const { tenantId } = await requireAuth('messages:read');

    const { rows } = await pool.query(`
        SELECT id, name, subject, body, type, variables, created_at AS "createdAt"
        FROM message_templates 
        WHERE tenant_id = $1 
        ORDER BY name
    `, [tenantId]);

    return rows;
}
