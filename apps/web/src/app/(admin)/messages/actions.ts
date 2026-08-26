'use server';

/**
 * Communication module — server actions for the admin Messages surfaces.
 *
 * WHY THIS FILE EXISTS
 * The repo carries two overlapping messaging layers:
 *   1. `messages`      + `lib/actions/communication.ts` — one row per single recipient.
 *   2. `message_logs`  + `lib/actions/messaging.ts`     — one row per batch (many recipients).
 * The admin UI is built on layer 2 (`message_logs`), because that is the layer the
 * compose and template screens actually write to. Real *delivery* state for either
 * layer lives in `notification_outbox` / `notification_delivery_events`, which is what
 * the tracking screen reads.
 *
 * HONESTY NOTE: nothing here sends anything. `enqueueNotification` writes an outbox row
 * and a background job. No dispatcher runs in production today, so a queued message
 * stays queued. Every label in the UI says "queued", never "sent".
 */

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import {
    enqueueNotification,
    providerForChannel,
    type NotificationChannel,
} from '@/lib/notifications/outbox';
import {
    MESSAGE_CHANNELS,
    extractTemplateVariables,
    normaliseChannel,
    type ChannelAvailability,
    type GradeOption,
    type MessageChannel,
    type MessageLogRow,
    type MessagingOverview,
    type OutboxRow,
    type QueueResult,
    type RecipientOption,
    type TemplateRow,
} from './types';

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
    return [];
}

function isoOrNull(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ─── Channel availability ────────────────────────────────────────────────────
/**
 * Adapters `lib/notifications/outbox.ts` will actually dispatch through. Mirrors the
 * table inside its `assertSupportedProvider`; anything else makes `enqueueNotification`
 * throw, so the UI must not offer the channel. WhatsApp has no live adapter at all —
 * only the development mock — which is why its live list is empty.
 */
const SUPPORTED_PROVIDERS: Record<string, readonly string[]> = {
    EMAIL: ['smtp', 'resend'],
    SMS: ['msg91', 'twilio'],
    WHATSAPP: [],
};

/**
 * Reports which channels the outbox will accept a message on in this runtime.
 * `providerForChannel` returns 'unconfigured' when no <CHANNEL>_PROVIDER env var is set,
 * and `enqueueNotification` throws for those channels — so this is the difference
 * between a queue attempt that works and one that fails immediately.
 */
function resolveAvailability(channel: MessageChannel): ChannelAvailability {
    const provider = providerForChannel(channel as NotificationChannel);

    if (provider === 'unconfigured') {
        return {
            channel,
            provider,
            configured: false,
            reason: `No ${channel}_PROVIDER is set for this deployment.`,
        };
    }

    // 'mock' resolves only where mock integrations are explicitly permitted, which
    // never includes production; treat it as usable but say so plainly.
    if (provider === 'mock') {
        return {
            channel,
            provider,
            configured: true,
            reason: 'Development mock provider — nothing leaves the machine.',
        };
    }

    if (!SUPPORTED_PROVIDERS[channel]?.includes(provider)) {
        return {
            channel,
            provider,
            configured: false,
            reason: `No adapter is installed for the "${provider}" ${channel} provider.`,
        };
    }

    return { channel, provider, configured: true, reason: null };
}

export async function getChannelAvailability(): Promise<ChannelAvailability[]> {
    await requireAuth('messaging:read');
    return MESSAGE_CHANNELS.map(resolveAvailability);
}

// ─── Templates ───────────────────────────────────────────────────────────────
export async function listMessageTemplates(): Promise<TemplateRow[]> {
    const { tenantId } = await requireAuth('messaging:read');

    const { rows } = await pool.query(
        `SELECT t.id,
                t.name,
                t.channel,
                t.subject,
                t.body,
                t.variables,
                t.is_active   AS "isActive",
                t.created_at  AS "createdAt",
                COUNT(l.id)::int AS "usageCount"
           FROM message_templates t
           LEFT JOIN message_logs l
                  ON l.template_id = t.id
                 AND l.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1
          GROUP BY t.id
          ORDER BY t.is_active DESC, t.name ASC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        channel: row.channel,
        subject: row.subject,
        body: row.body,
        variables: toStringArray(row.variables),
        isActive: Boolean(row.isActive),
        createdAt: isoOrNull(row.createdAt) ?? '',
        usageCount: Number(row.usageCount ?? 0),
    }));
}

export async function createTemplate(input: {
    name: string;
    channel: string;
    subject?: string;
    body: string;
}): Promise<{ success: boolean; error?: string; templateId?: string }> {
    const { tenantId } = await requireAuth('messaging:write');

    const name = input.name.trim();
    const body = input.body.trim();
    const channel = normaliseChannel(input.channel);
    const subject = (input.subject || '').trim();

    if (!name) return { success: false, error: 'Template name is required.' };
    if (!channel) return { success: false, error: 'Choose SMS, WhatsApp, or Email.' };
    if (!body) return { success: false, error: 'Message body is required.' };
    if (channel === 'EMAIL' && !subject) {
        return { success: false, error: 'Email templates need a subject line.' };
    }

    const variables = extractTemplateVariables(`${subject} ${body}`);

    try {
        const { rows } = await pool.query(
            `INSERT INTO message_templates (tenant_id, name, channel, subject, body, variables)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             RETURNING id`,
            [tenantId, name, channel, subject || null, body, JSON.stringify(variables)],
        );
        revalidatePath('/messages/templates');
        revalidatePath('/messages');
        return { success: true, templateId: rows[0].id };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not save the template.',
        };
    }
}

export async function setTemplateActive(
    templateId: string,
    isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('messaging:write');

    const { rowCount } = await pool.query(
        `UPDATE message_templates SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
        [isActive, templateId, tenantId],
    );
    if (!rowCount) return { success: false, error: 'Template not found.' };

    revalidatePath('/messages/templates');
    return { success: true };
}

export async function deleteTemplate(
    templateId: string,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('messaging:write');

    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM message_logs WHERE tenant_id = $1 AND template_id = $2`,
        [tenantId, templateId],
    );
    if (Number(rows[0]?.c ?? 0) > 0) {
        return {
            success: false,
            error: 'This template is referenced by existing message batches. Deactivate it instead.',
        };
    }

    const { rowCount } = await pool.query(
        `DELETE FROM message_templates WHERE id = $1 AND tenant_id = $2`,
        [templateId, tenantId],
    );
    if (!rowCount) return { success: false, error: 'Template not found.' };

    revalidatePath('/messages/templates');
    return { success: true };
}

// ─── Message batches (message_logs) ──────────────────────────────────────────
export async function listMessageBatches(limit = 100): Promise<MessageLogRow[]> {
    const { tenantId } = await requireAuth('messaging:read');

    const { rows } = await pool.query(
        `SELECT l.id,
                l.channel,
                l.subject,
                l.message,
                l.recipients,
                l.status,
                COALESCE(l.delivery_count, 0) AS "deliveryCount",
                COALESCE(l.failure_count, 0)  AS "failureCount",
                l.sent_at                     AS "sentAt",
                t.name                        AS "templateName",
                COALESCE(o.pending, 0)::int   AS "outboxPending",
                COALESCE(o.sent, 0)::int      AS "outboxSent",
                COALESCE(o.failed, 0)::int    AS "outboxFailed"
           FROM message_logs l
           LEFT JOIN message_templates t
                  ON t.id = l.template_id
                 AND t.tenant_id = l.tenant_id
           LEFT JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE n.status IN ('PENDING', 'QUEUED'))     AS pending,
                       COUNT(*) FILTER (WHERE n.status IN ('SENT', 'DELIVERED'))     AS sent,
                       COUNT(*) FILTER (WHERE n.status IN ('FAILED', 'DEAD_LETTER')) AS failed
                  FROM notification_outbox n
                 WHERE n.tenant_id = l.tenant_id
                   AND n.payload->>'messageLogId' = l.id::text
           ) o ON TRUE
          WHERE l.tenant_id = $1
          ORDER BY l.sent_at DESC
          LIMIT $2`,
        [tenantId, limit],
    );

    return rows.map((row) => {
        const recipients = toStringArray(row.recipients);
        return {
            id: row.id,
            channel: row.channel,
            subject: row.subject,
            message: row.message,
            recipients,
            recipientCount: recipients.length,
            status: row.status,
            deliveryCount: Number(row.deliveryCount ?? 0),
            failureCount: Number(row.failureCount ?? 0),
            sentAt: isoOrNull(row.sentAt),
            templateName: row.templateName,
            outboxPending: Number(row.outboxPending ?? 0),
            outboxSent: Number(row.outboxSent ?? 0),
            outboxFailed: Number(row.outboxFailed ?? 0),
        };
    });
}

export async function getMessagingOverview(): Promise<MessagingOverview> {
    const { tenantId } = await requireAuth('messaging:read');

    const [templateRes, logRes, outboxRes] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE is_active)::int AS active
               FROM message_templates
              WHERE tenant_id = $1`,
            [tenantId],
        ),
        pool.query(
            `SELECT COUNT(*)::int AS batches,
                    COALESCE(SUM(jsonb_array_length(COALESCE(recipients, '[]'::jsonb))), 0)::int AS recipients,
                    COUNT(*) FILTER (WHERE status = 'QUEUED')::int AS queued,
                    COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
               FROM message_logs
              WHERE tenant_id = $1`,
            [tenantId],
        ),
        pool.query(
            `SELECT COUNT(*) FILTER (WHERE status IN ('SENT', 'DELIVERED'))::int AS dispatched
               FROM notification_outbox
              WHERE tenant_id = $1`,
            [tenantId],
        ),
    ]);

    return {
        templates: Number(templateRes.rows[0]?.total ?? 0),
        activeTemplates: Number(templateRes.rows[0]?.active ?? 0),
        batches: Number(logRes.rows[0]?.batches ?? 0),
        recipients: Number(logRes.rows[0]?.recipients ?? 0),
        queued: Number(logRes.rows[0]?.queued ?? 0),
        failed: Number(logRes.rows[0]?.failed ?? 0),
        dispatched: Number(outboxRes.rows[0]?.dispatched ?? 0),
    };
}

// ─── Outbox (the only real delivery state) ───────────────────────────────────
export async function listOutboxNotifications(limit = 200): Promise<OutboxRow[]> {
    const { tenantId } = await requireAuth('messaging:read');

    const { rows } = await pool.query(
        `SELECT n.id,
                n.channel,
                n.status,
                n.provider,
                n.recipient,
                n.subject,
                n.body,
                n.attempts,
                n.max_attempts        AS "maxAttempts",
                n.last_error          AS "lastError",
                n.provider_message_id AS "providerMessageId",
                n.created_at          AS "createdAt",
                n.scheduled_for       AS "scheduledFor",
                n.sent_at             AS "sentAt",
                e.last_event_at       AS "lastEventAt"
           FROM notification_outbox n
           LEFT JOIN LATERAL (
                SELECT MAX(d.created_at) AS last_event_at
                  FROM notification_delivery_events d
                 WHERE d.tenant_id = n.tenant_id
                   AND d.notification_id = n.id
           ) e ON TRUE
          WHERE n.tenant_id = $1
          ORDER BY n.created_at DESC
          LIMIT $2`,
        [tenantId, limit],
    );

    return rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        status: row.status,
        provider: row.provider,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        attempts: Number(row.attempts ?? 0),
        maxAttempts: Number(row.maxAttempts ?? 0),
        lastError: row.lastError,
        providerMessageId: row.providerMessageId,
        createdAt: isoOrNull(row.createdAt) ?? '',
        scheduledFor: isoOrNull(row.scheduledFor) ?? '',
        sentAt: isoOrNull(row.sentAt),
        lastEventAt: isoOrNull(row.lastEventAt),
    }));
}

// ─── Recipient directory ─────────────────────────────────────────────────────
/**
 * Primary guardians of active students, optionally narrowed to one grade.
 * These are the real contact rows a school would message; there is no fabricated
 * address list anywhere in this module.
 */
export async function listGuardianRecipients(gradeId?: string): Promise<RecipientOption[]> {
    const { tenantId } = await requireAuth('messaging:read');

    const params: unknown[] = [tenantId];
    let gradeClause = '';
    if (gradeId) {
        params.push(gradeId);
        gradeClause = ` AND s.grade_id = $${params.length}`;
    }

    const { rows } = await pool.query(
        `SELECT g.id,
                g.first_name || ' ' || g.last_name AS label,
                g.email,
                g.phone,
                s.first_name || ' ' || s.last_name AS "studentName",
                s.grade_id AS "gradeId",
                gr.name  AS "gradeName",
                sec.name AS "sectionName"
           FROM guardians g
           JOIN students s   ON s.id = g.student_id  AND s.tenant_id = g.tenant_id
           LEFT JOIN grades gr   ON gr.id = s.grade_id   AND gr.tenant_id = s.tenant_id
           LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
          WHERE g.tenant_id = $1
            AND s.status = 'ACTIVE'
            AND g.is_primary = true
            AND (g.email IS NOT NULL OR g.phone IS NOT NULL)${gradeClause}
          ORDER BY gr.display_order NULLS LAST, sec.name, s.first_name
          LIMIT 500`,
        params,
    );

    return rows.map((row) => ({
        id: row.id,
        label: row.label,
        detail: [row.studentName, [row.gradeName, row.sectionName].filter(Boolean).join('-')]
            .filter(Boolean)
            .join(' · '),
        gradeId: row.gradeId ?? null,
        email: row.email,
        phone: row.phone,
    }));
}

export async function listGradeOptions(): Promise<GradeOption[]> {
    const { tenantId } = await requireAuth('messaging:read');
    const { rows } = await pool.query(
        `SELECT id, name FROM grades WHERE tenant_id = $1 ORDER BY display_order`,
        [tenantId],
    );
    return rows.map((row) => ({ id: row.id, name: row.name }));
}

// ─── Queue a batch ───────────────────────────────────────────────────────────
/**
 * Writes a `message_logs` batch and one `notification_outbox` row per recipient.
 * Returns how many recipients reached the outbox. It does NOT send: a queued row
 * sits in the outbox until a dispatcher processes it.
 */
export async function queueMessageBatch(input: {
    channel: string;
    recipients: string[];
    subject?: string;
    body: string;
    templateId?: string;
}): Promise<QueueResult> {
    const { tenantId, userId } = await requireAuth('messaging:write');

    const channel = normaliseChannel(input.channel);
    if (!channel) {
        return { success: false, error: 'Choose SMS, WhatsApp, or Email.', queued: 0, rejected: 0 };
    }

    const body = input.body.trim();
    if (!body) return { success: false, error: 'Message body is required.', queued: 0, rejected: 0 };

    const subject = (input.subject || '').trim();
    if (channel === 'EMAIL' && !subject) {
        return { success: false, error: 'Email messages need a subject line.', queued: 0, rejected: 0 };
    }

    const recipients = [...new Set(input.recipients.map((r) => r.trim()).filter(Boolean))];
    if (recipients.length === 0) {
        return { success: false, error: 'Add at least one recipient.', queued: 0, rejected: 0 };
    }
    if (recipients.length > 100) {
        return {
            success: false,
            error: 'A single batch is limited to 100 recipients.',
            queued: 0,
            rejected: 0,
        };
    }

    const availability = resolveAvailability(channel);
    if (!availability.configured) {
        return {
            success: false,
            error: `${availability.reason} Nothing can be queued on this channel.`,
            queued: 0,
            rejected: recipients.length,
        };
    }

    const { rows } = await pool.query(
        `INSERT INTO message_logs (tenant_id, template_id, channel, recipients, message, subject, sent_by, status)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'QUEUED')
         RETURNING id`,
        [tenantId, input.templateId || null, channel, JSON.stringify(recipients), body, subject || null, userId],
    );
    const batchId: string = rows[0].id;

    const results = await Promise.allSettled(
        recipients.map((recipient, index) =>
            enqueueNotification({
                tenantId,
                channel: channel as NotificationChannel,
                recipient,
                subject: subject || undefined,
                body,
                templateId: input.templateId || null,
                createdBy: userId,
                payload: { messageLogId: batchId },
                idempotencyKey: `message-log:${batchId}:recipient:${index}`,
            }),
        ),
    );

    const queued = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.length - queued;

    await pool.query(
        `UPDATE message_logs
            SET status = CASE WHEN $1::int > 0 THEN 'QUEUED'::msg_template_status
                              ELSE 'FAILED'::msg_template_status END,
                failure_count = $2
          WHERE tenant_id = $3 AND id = $4`,
        [queued, rejected, tenantId, batchId],
    );

    revalidatePath('/messages');
    revalidatePath('/messages/tracking');

    if (queued === 0) {
        const firstRejection = results.find((r) => r.status === 'rejected');
        const reason =
            firstRejection && firstRejection.status === 'rejected' && firstRejection.reason instanceof Error
                ? firstRejection.reason.message
                : 'The notification outbox rejected every recipient.';
        return { success: false, error: reason, batchId, queued, rejected };
    }

    return {
        success: true,
        batchId,
        queued,
        rejected,
        error: rejected > 0 ? `${rejected} recipient(s) could not be queued.` : undefined,
    };
}
