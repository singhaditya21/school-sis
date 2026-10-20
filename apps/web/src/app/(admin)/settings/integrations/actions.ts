'use server';

/**
 * @module app/(admin)/settings/integrations/actions
 *
 * Server actions powering the `/settings/integrations` Notification & Provider Readiness Console:
 *   - `getIntegrationsConsoleData`: Inspects live adapter configuration (`EMAIL`, `SMS`, `WHATSAPP`, `PUSH`, `IN_APP`)
 *     and aggregates tenant-scoped `notification_outbox` delivery counts (`settings:read`).
 *   - `sendTestChannelNotification`: Enqueues and immediately processes a verification message on a configured
 *     channel and records `NOTIFICATION_TEST_DISPATCH` in `audit_logs` (`settings:write`).
 *   - `retryOutboxNotification`: Re-runs `processNotification` for a queued/failed outbox entry and records
 *     `NOTIFICATION_OUTBOX_RETRY` in `audit_logs` (`settings:write`).
 */

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/middleware';
import { sql } from '@/lib/db';
import {
    describeChannelReadiness,
    type ChannelReadiness,
    type NotificationChannel,
} from '@/lib/notifications/channels';
import { enqueueNotification, processNotification } from '@/lib/notifications/outbox';

export interface OutboxSummaryRow {
    channel: string;
    provider: string;
    status: string;
    count: number;
}

export interface OutboxMessageRow {
    id: string;
    channel: string;
    provider: string;
    status: string;
    recipient: string;
    subject: string | null;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    createdAt: string;
    sentAt: string | null;
}

export interface IntegrationsConsoleData {
    channels: ChannelReadiness[];
    summary: OutboxSummaryRow[];
    recentOutbox: OutboxMessageRow[];
}

const ALL_CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getIntegrationsConsoleData(): Promise<IntegrationsConsoleData> {
    const { tenantId } = await requireAuth('settings:read');

    const channels = ALL_CHANNELS.map((ch) => describeChannelReadiness(ch));

    const summaryRows = await sql<{
        channel: string;
        provider: string;
        status: string;
        count: number;
    }>`
        SELECT channel,
               provider,
               status,
               COUNT(*)::int AS count
        FROM notification_outbox
        WHERE tenant_id = ${tenantId}
        GROUP BY channel, provider, status
        ORDER BY channel ASC, status ASC
    `;

    const recentRows = await sql<{
        id: string;
        channel: string;
        provider: string;
        status: string;
        recipient: string;
        subject: string | null;
        attempts: number;
        maxAttempts: number;
        lastError: string | null;
        createdAt: Date | string;
        sentAt: Date | string | null;
    }>`
        SELECT id,
               channel,
               provider,
               status,
               recipient,
               subject,
               attempts,
               max_attempts AS "maxAttempts",
               last_error AS "lastError",
               created_at AS "createdAt",
               sent_at AS "sentAt"
        FROM notification_outbox
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT 25
    `;

    return {
        channels,
        summary: summaryRows,
        recentOutbox: recentRows.map((row) => ({
            id: row.id,
            channel: row.channel,
            provider: row.provider,
            status: row.status,
            recipient: row.recipient,
            subject: row.subject,
            attempts: Number(row.attempts ?? 0),
            maxAttempts: Number(row.maxAttempts ?? 3),
            lastError: row.lastError,
            createdAt: new Date(row.createdAt).toISOString(),
            sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : null,
        })),
    };
}

export async function sendTestChannelNotification(
    channel: NotificationChannel,
    recipient: string,
): Promise<{ success: boolean; status?: string; error?: string }> {
    const { tenantId, userId } = await requireAuth('settings:write');

    if (!ALL_CHANNELS.includes(channel)) {
        return { success: false, error: `Unsupported notification channel: ${channel}` };
    }

    const cleanRecipient = recipient.trim();
    if (!cleanRecipient) {
        return { success: false, error: 'Recipient is required to dispatch a test message.' };
    }

    const readiness = describeChannelReadiness(channel);
    if (!readiness.available) {
        return {
            success: false,
            error: readiness.reason || `${channel} provider is not configured on this deployment.`,
        };
    }

    try {
        const queued = await enqueueNotification({
            tenantId,
            channel,
            recipient: cleanRecipient,
            subject: `[ScholarMind Test] ${channel} Channel Verification`,
            body: `This is a live verification dispatch from ScholarMind Integrations Console (${new Date().toISOString()}).`,
            createdBy: userId,
        });

        const delivery = await processNotification(queued.notificationId, tenantId);
        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'NOTIFICATION_TEST_DISPATCH',
                'notification_outbox',
                ${queued.notificationId},
                ${JSON.stringify({
                    channel,
                    recipient: cleanRecipient,
                    status: delivery.status,
                    success: delivery.success,
                })}::jsonb
            )
        `.execute();
        revalidatePath('/settings/integrations');

        if (!delivery.success) {
            return {
                success: false,
                status: delivery.status,
                error: delivery.error || 'Provider rejected test notification.',
            };
        }

        return {
            success: true,
            status: delivery.status,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to enqueue test notification.',
        };
    }
}

export async function retryOutboxNotification(
    notificationId: string,
): Promise<{ success: boolean; status?: string; error?: string }> {
    const { tenantId, userId } = await requireAuth('settings:write');

    if (!UUID_RE.test(notificationId)) {
        return { success: false, error: 'Invalid notification ID.' };
    }

    try {
        const result = await processNotification(notificationId, tenantId);
        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'NOTIFICATION_OUTBOX_RETRY',
                'notification_outbox',
                ${notificationId},
                ${JSON.stringify({
                    status: result.status,
                    success: result.success,
                })}::jsonb
            )
        `.execute();
        revalidatePath('/settings/integrations');
        return {
            success: result.success,
            status: result.status,
            error: result.error,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not retry notification.',
        };
    }
}
