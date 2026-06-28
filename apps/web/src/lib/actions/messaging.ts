'use server';

import { pool, db } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { messageLogs } from '@/lib/db/schema/messaging';
import { eq, desc } from 'drizzle-orm';

export async function getMessageTemplates(channel?: string) {
    const { tenantId } = await requireAuth('messaging:read');
    let query = `SELECT id, tenant_id AS "tenantId", name, channel, subject, body, variables FROM message_templates WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    if (channel) {
        params.push(channel);
        query += ` AND channel = $2`;
    }
    const { rows } = await pool.query(query, params);
    return rows;
}

export async function createMessageTemplate(data: {
    name: string; channel: string; subject?: string; body: string; variables?: string[];
}) {
    const { tenantId } = await requireAuth('messaging:write');
    const { rows } = await pool.query(
        `INSERT INTO message_templates (tenant_id, name, channel, subject, body, variables)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id AS "tenantId", name, channel, subject, body, variables`,
        [tenantId, data.name, data.channel, data.subject || null, data.body, data.variables || []]
    );
    return { success: true, template: rows[0] };
}

export async function sendMessageAction(data: {
    templateId?: string; channel: string; recipients: string[]; message: string; subject?: string;
}) {
    const { tenantId, userId } = await requireAuth('messaging:write');
    const insertRes = await pool.query(
        `INSERT INTO message_logs (
            tenant_id, template_id, channel, recipients, message, subject, sent_by, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            tenantId, 
            data.templateId || null, 
            data.channel, 
            data.recipients, 
            data.message, 
            data.subject || null, 
            userId, 
            'QUEUED'
        ]
    );
    const log = insertRes.rows[0];
    
    // In production, this would trigger the actual SMS/Email/WhatsApp provider
    await pool.query(
        `UPDATE message_logs SET status = 'SENT', delivery_count = $1 WHERE id = $2`,
        [data.recipients.length, log.id]
    );
    return { success: true, messageId: log.id };
}

export async function getMessageLogs() {
    const { tenantId } = await requireAuth('messaging:read');
    return db
        .select()
        .from(messageLogs)
        .where(eq(messageLogs.tenantId, tenantId))
        .orderBy(desc(messageLogs.sentAt));
}

export async function getMessagingStats() {
    const { tenantId } = await requireAuth('messaging:read');
    const countRes = await pool.query(
        `SELECT COUNT(*)::int AS c FROM message_templates WHERE tenant_id = $1`, 
        [tenantId]
    );
    const templateCount = countRes.rows[0];
    
    const logsRes = await pool.query(
        `SELECT status FROM message_logs WHERE tenant_id = $1`, 
        [tenantId]
    );
    const logs = logsRes.rows;
    
    return {
        templates: templateCount?.c || 0, totalSent: logs.length,
        delivered: logs.filter(l => l.status === 'DELIVERED' || l.status === 'SENT').length,
        failed: logs.filter(l => l.status === 'FAILED').length,
    };
}
