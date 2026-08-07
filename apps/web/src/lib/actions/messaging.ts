'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { enqueueNotification, type NotificationChannel } from '@/lib/notifications/outbox';

export async function getMessageTemplates(channel?: string) {
    const { tenantId } = await requireAuth('messaging:read');
    let query = `SELECT id, tenant_id AS "tenantId", name, channel, subject, body, variables FROM message_templates WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
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
    const channel = data.channel.trim().toUpperCase();
    if (!['SMS', 'WHATSAPP', 'EMAIL'].includes(channel)) {
        return { success: false, error: 'Unsupported messaging channel.' };
    }
    const recipients = [...new Set(data.recipients.map((recipient) => recipient.trim()).filter(Boolean))];
    if (recipients.length === 0 || recipients.length > 100 || !data.message.trim()) {
        return { success: false, error: 'Provide a message and between 1 and 100 unique recipients.' };
    }

    const insertRes = await pool.query(
        `INSERT INTO message_logs (
            tenant_id, template_id, channel, recipients, message, subject, sent_by, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            tenantId,
            data.templateId || null, 
            channel,
            JSON.stringify(recipients),
            data.message, 
            data.subject || null, 
            userId, 
            'QUEUED'
        ]
    );
    const log = insertRes.rows[0];

    const results = await Promise.allSettled(recipients.map((recipient, index) => enqueueNotification({
        tenantId,
        channel: channel as NotificationChannel,
        recipient,
        subject: data.subject,
        body: data.message,
        templateId: data.templateId,
        createdBy: userId,
        payload: { messageLogId: log.id },
        idempotencyKey: `message-log:${log.id}:recipient:${index}`,
    })));
    const queued = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - queued;
    await pool.query(
        `UPDATE message_logs
         SET status = CASE WHEN $1::int > 0 THEN 'QUEUED'::msg_template_status ELSE 'FAILED'::msg_template_status END,
             failure_count = $2
         WHERE tenant_id = $3 AND id = $4`,
        [queued, failed, tenantId, log.id],
    );
    return {
        success: failed === 0,
        status: queued > 0 ? 'QUEUED' : 'FAILED',
        messageId: log.id,
        queued,
        failed,
        error: failed > 0 ? `${failed} recipient notification(s) could not be queued.` : undefined,
    };
}

export async function getMessageLogs() {
    const { tenantId } = await requireAuth('messaging:read');
    const { rows } = await pool.query(
        `SELECT * FROM message_logs WHERE tenant_id = $1 ORDER BY sent_at DESC`,
        [tenantId]
    );
    return rows;
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
