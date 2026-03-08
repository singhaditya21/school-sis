'use server';

import { db } from '@/lib/db';
import { messageTemplates, messageLogs } from '@/lib/db/schema';
import { eq, and, count, sql, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export async function getMessageTemplates(channel?: string) {
    const { tenantId } = await requireAuth('messaging:read');
    const conditions = [eq(messageTemplates.tenantId, tenantId)];
    if (channel) conditions.push(eq(messageTemplates.channel, channel as any));
    return db.select().from(messageTemplates).where(and(...conditions));
}

export async function createMessageTemplate(data: {
    name: string; channel: string; subject?: string; body: string; variables?: string[];
}) {
    const { tenantId } = await requireAuth('messaging:write');
    const [tpl] = await db.insert(messageTemplates).values({
        tenantId, name: data.name, channel: data.channel as any,
        subject: data.subject, body: data.body, variables: data.variables || [],
    }).returning();
    return { success: true, template: tpl };
}

export async function sendMessageAction(data: {
    templateId?: string; channel: string; recipients: string[]; message: string; subject?: string;
}) {
    const { tenantId, userId } = await requireAuth('messaging:write');
    const [log] = await db.insert(messageLogs).values({
        tenantId, templateId: data.templateId, channel: data.channel as any,
        recipients: data.recipients, message: data.message, subject: data.subject,
        sentBy: userId, status: 'QUEUED',
    }).returning();
    // In production, this would trigger the actual SMS/Email/WhatsApp provider
    await db.update(messageLogs).set({ status: 'SENT', deliveryCount: data.recipients.length }).where(eq(messageLogs.id, log.id));
    return { success: true, messageId: log.id };
}

export async function getMessageLogs() {
    const { tenantId } = await requireAuth('messaging:read');
    return db.select().from(messageLogs).where(eq(messageLogs.tenantId, tenantId)).orderBy(desc(messageLogs.sentAt));
}

export async function getMessagingStats() {
    const { tenantId } = await requireAuth('messaging:read');
    const [templateCount] = await db.select({ c: count() }).from(messageTemplates).where(eq(messageTemplates.tenantId, tenantId));
    const logs = await db.select().from(messageLogs).where(eq(messageLogs.tenantId, tenantId));
    return {
        templates: templateCount?.c || 0, totalSent: logs.length,
        delivered: logs.filter(l => l.status === 'DELIVERED' || l.status === 'SENT').length,
        failed: logs.filter(l => l.status === 'FAILED').length,
    };
}
