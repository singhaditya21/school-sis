'use server';

/**
 * Communication module Server Actions.
 * Handles messages, notifications, and consent management.
 */

import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import { enqueueJob } from '@/lib/services/jobs';

// ─── Get Messages ─────────────────────────────────────────
export async function getMessages(options?: {
    channel?: string;
    limit?: number;
    offset?: number;
}) {
    const { tenantId } = await requireAuth();

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const conditions = [eq(schema.messages.tenantId, tenantId)];
    if (options?.channel) {
        conditions.push(eq(schema.messages.channel, options.channel as any));
    }

    const msgs = await db
        .select({
            id: schema.messages.id,
            channel: schema.messages.channel,
            subject: schema.messages.subject,
            body: schema.messages.body,
            status: schema.messages.status,
            sentAt: schema.messages.sentAt,
            createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .where(and(...conditions))
        .orderBy(desc(schema.messages.createdAt))
        .limit(limit)
        .offset(offset);

    const [countResult] = await db
        .select({ count: count() })
        .from(schema.messages)
        .where(and(...conditions));

    return { messages: msgs, total: countResult.count };
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

    // Create message record
    await db.insert(schema.messages).values({
        id: messageId,
        tenantId,
        channel: data.channel,
        subject: data.subject,
        body: data.body,
        recipientId: data.recipientId || null,
        recipientPhone: data.recipientPhone || null,
        recipientEmail: data.recipientEmail || null,
        sentBy: userId,
        status: 'QUEUED',
    });

    // Enqueue delivery job
    const jobType = data.channel === 'SMS' ? 'send-sms'
        : data.channel === 'WHATSAPP' ? 'send-whatsapp'
            : 'send-email';

    await enqueueJob(jobType as any, {
        messageId,
        channel: data.channel,
        subject: data.subject,
        body: data.body,
    });

    // Update status to SENT
    await db.update(schema.messages)
        .set({ status: 'SENT', sentAt: new Date() })
        .where(eq(schema.messages.id, messageId));

    return { success: true, messageId };
}

// ─── Get Communication Stats ──────────────────────────────
export async function getCommunicationStats() {
    const { tenantId } = await requireAuth();

    const [stats] = await db
        .select({
            total: count(),
            sms: sql<number>`count(*) filter (where ${schema.messages.channel} = 'SMS')`,
            whatsapp: sql<number>`count(*) filter (where ${schema.messages.channel} = 'WHATSAPP')`,
            email: sql<number>`count(*) filter (where ${schema.messages.channel} = 'EMAIL')`,
        })
        .from(schema.messages)
        .where(eq(schema.messages.tenantId, tenantId));

    return stats;
}

// ─── Get Consent Status ───────────────────────────────────
export async function getConsentStats() {
    const { tenantId } = await requireAuth();

    const [consentData] = await db
        .select({
            total: count(),
            opted_in: sql<number>`count(*) filter (where ${schema.consents.isOptedIn} = true)`,
            opted_out: sql<number>`count(*) filter (where ${schema.consents.isOptedIn} = false)`,
        })
        .from(schema.consents)
        .where(eq(schema.consents.tenantId, tenantId));

    return consentData;
}
