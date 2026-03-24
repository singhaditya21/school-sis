'use server';

import { db } from '@/lib/db';
import { webhookSubscriptions, webhookDeliveries } from '@/lib/db/schema';
import { eq, and, count, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import crypto from 'crypto';

// ─── Webhook Management ─────────────────────────────────────

export async function registerWebhook(data: {
    name: string;
    url: string;
    events: string[];
    headers?: Record<string, string>;
}) {
    const { tenantId } = await requireAuth('webhooks:write');

    const secret = crypto.randomBytes(32).toString('hex');

    await db.insert(webhookSubscriptions).values({
        id: randomUUID(),
        tenantId,
        name: data.name,
        url: data.url,
        secret,
        events: data.events,
        headers: data.headers,
    });

    return { success: true, secret };
}

export async function listWebhooks() {
    const { tenantId } = await requireAuth('webhooks:read');

    return db
        .select({
            id: webhookSubscriptions.id,
            name: webhookSubscriptions.name,
            url: webhookSubscriptions.url,
            events: webhookSubscriptions.events,
            status: webhookSubscriptions.status,
            createdAt: webhookSubscriptions.createdAt,
        })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.tenantId, tenantId))
        .orderBy(desc(webhookSubscriptions.createdAt));
}

export async function deleteWebhook(webhookId: string) {
    const { tenantId } = await requireAuth('webhooks:write');

    await db.delete(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.id, webhookId), eq(webhookSubscriptions.tenantId, tenantId)));

    return { success: true };
}

// ─── Event Dispatcher ────────────────────────────────────────

export async function dispatchEvent(tenantId: string, event: string, payload: Record<string, unknown>) {
    // Find all active subscriptions matching this event
    const subs = await db
        .select({
            id: webhookSubscriptions.id,
            events: webhookSubscriptions.events,
            url: webhookSubscriptions.url,
            secret: webhookSubscriptions.secret,
            headers: webhookSubscriptions.headers,
            retryCount: webhookSubscriptions.retryCount,
            timeoutMs: webhookSubscriptions.timeoutMs,
        })
        .from(webhookSubscriptions)
        .where(and(
            eq(webhookSubscriptions.tenantId, tenantId),
            eq(webhookSubscriptions.status, 'ACTIVE'),
        ));

    // Filter subscriptions by event match
    const matchingSubs = subs.filter(sub => {
        const events = sub.events as string[];
        return events.includes(event) || events.includes('*');
    });

    // Fire-and-forget delivery for each subscription
    for (const sub of matchingSubs) {
        const deliveryId = randomUUID();
        const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
        const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');

        // Log delivery attempt
        await db.insert(webhookDeliveries).values({
            id: deliveryId,
            subscriptionId: sub.id,
            event,
            payload: { event, payload },
            status: 'PENDING',
        });

        // Deliver asynchronously (fire-and-forget)
        deliverWebhook(deliveryId, sub.url, body, signature, sub.headers as Record<string, string> | null, sub.timeoutMs)
            .catch(err => console.error(`[Webhook] Delivery ${deliveryId} failed:`, err));
    }

    return { dispatched: matchingSubs.length };
}

async function deliverWebhook(
    deliveryId: string,
    url: string,
    body: string,
    signature: string,
    customHeaders: Record<string, string> | null,
    timeoutMs: number,
) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': 'event',
                ...(customHeaders || {}),
            },
            body,
            signal: controller.signal,
        });

        clearTimeout(timeout);

        await db.update(webhookDeliveries)
            .set({
                status: res.ok ? 'SUCCESS' : 'FAILED',
                responseCode: res.status,
                attempts: 1,
                lastAttemptAt: new Date(),
                error: res.ok ? null : `HTTP ${res.status}`,
            })
            .where(eq(webhookDeliveries.id, deliveryId));
    } catch (err: any) {
        await db.update(webhookDeliveries)
            .set({
                status: 'FAILED',
                attempts: 1,
                lastAttemptAt: new Date(),
                error: err.message,
            })
            .where(eq(webhookDeliveries.id, deliveryId));
    }
}

// ─── Delivery Logs ───────────────────────────────────────────

export async function getWebhookDeliveries(webhookId: string) {
    await requireAuth('webhooks:read');

    return db
        .select({
            id: webhookDeliveries.id,
            event: webhookDeliveries.event,
            status: webhookDeliveries.status,
            responseCode: webhookDeliveries.responseCode,
            attempts: webhookDeliveries.attempts,
            error: webhookDeliveries.error,
            createdAt: webhookDeliveries.createdAt,
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.subscriptionId, webhookId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(50);
}
