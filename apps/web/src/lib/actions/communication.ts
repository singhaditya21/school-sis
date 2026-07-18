'use server';

/**
 * Communication module Server Actions.
 * Handles messages, notifications, and consent management.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import { enqueueNotification, type NotificationChannel } from '@/lib/notifications/outbox';

// ─── Get Messages ─────────────────────────────────────────
export async function getMessages(options?: {
    channel?: string;
    limit?: number;
    offset?: number;
}) {
    const { tenantId } = await requireAuth();

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = `
        SELECT 
            id, channel, subject, body, status, sent_at AS "sentAt", created_at AS "createdAt"
        FROM messages
        WHERE tenant_id = $1
    `;
    const params: string[] = [tenantId];

    if (options?.channel) {
        params.push(options.channel);
        query += ` AND channel = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    const { rows: msgs } = await pool.query(query, [...params, limit, offset]);

    let countQuery = `SELECT COUNT(*) AS count FROM messages WHERE tenant_id = $1`;
    const countParams: string[] = [tenantId];
    if (options?.channel) {
        countParams.push(options.channel);
        countQuery += ` AND channel = $${countParams.length}`;
    }

    const { rows: countResult } = await pool.query(countQuery, countParams);

    return { messages: msgs, total: Number(countResult[0]?.count || 0) };
}

// ─── Send Message (SMS/WhatsApp/Email) ────────────────────
export async function sendMessage(data: {
    channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'IN_APP' | 'PUSH';
    subject: string;
    body: string;
    recipientId?: string;
    recipientPhone?: string;
    recipientEmail?: string;
}) {
    const { tenantId, userId } = await requireAuth('communication:write');

    const messageId = randomUUID();
    const recipient = resolveMessageRecipient(data);

    // Create message record
    const insertQuery = `
        INSERT INTO messages (
            id, tenant_id, channel, subject, body, 
            recipient_id, recipient_phone, recipient_email, 
            sent_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'QUEUED')
    `;
    await pool.query(insertQuery, [
        messageId,
        tenantId,
        data.channel,
        data.subject,
        data.body,
        data.recipientId || null,
        data.recipientPhone || null,
        data.recipientEmail || null,
        userId
    ]);

    const notification = await enqueueNotification({
        tenantId,
        channel: data.channel as NotificationChannel,
        recipient,
        subject: data.subject,
        body: data.body,
        recipientUserId: data.recipientId || null,
        payload: { messageId },
        idempotencyKey: `message:${messageId}:${data.channel}`,
        createdBy: userId,
    });

    return { success: true, messageId, notificationId: notification.notificationId, jobId: notification.jobId };
}

function resolveMessageRecipient(data: {
    channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'IN_APP' | 'PUSH';
    recipientId?: string;
    recipientPhone?: string;
    recipientEmail?: string;
}): string {
    if (data.channel === 'EMAIL') {
        if (!data.recipientEmail) throw new Error('Recipient email is required.');
        return data.recipientEmail;
    }
    if (data.channel === 'SMS' || data.channel === 'WHATSAPP') {
        if (!data.recipientPhone) throw new Error('Recipient phone is required.');
        return data.recipientPhone;
    }
    if (!data.recipientId) {
        throw new Error('Recipient user is required.');
    }
    return data.recipientId;
}

// ─── Get Communication Stats ──────────────────────────────
export async function getCommunicationStats() {
    const { tenantId } = await requireAuth();

    const query = `
        SELECT 
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE channel = 'SMS') AS sms,
            COUNT(*) FILTER (WHERE channel = 'WHATSAPP') AS whatsapp,
            COUNT(*) FILTER (WHERE channel = 'EMAIL') AS email
        FROM messages
        WHERE tenant_id = $1
    `;
    const { rows } = await pool.query(query, [tenantId]);

    return {
        total: Number(rows[0]?.total || 0),
        sms: Number(rows[0]?.sms || 0),
        whatsapp: Number(rows[0]?.whatsapp || 0),
        email: Number(rows[0]?.email || 0),
    };
}

// ─── Get Consent Status ───────────────────────────────────
export async function getConsentStats() {
    const { tenantId } = await requireAuth();

    const query = `
        SELECT 
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_opted_in = true) AS opted_in,
            COUNT(*) FILTER (WHERE is_opted_in = false) AS opted_out
        FROM consents
        WHERE tenant_id = $1
    `;
    const { rows } = await pool.query(query, [tenantId]);

    return {
        total: Number(rows[0]?.total || 0),
        opted_in: Number(rows[0]?.opted_in || 0),
        opted_out: Number(rows[0]?.opted_out || 0),
    };
}
