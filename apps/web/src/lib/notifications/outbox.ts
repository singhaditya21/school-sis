import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import type { QueryResult } from 'pg';
import { getEmailProvider } from '@/lib/providers/email';
import { getSmsProvider } from '@/lib/providers/sms';
import { getPushProvider } from '@/lib/providers/push';
import { getWhatsAppProvider } from '@/lib/providers/whatsapp';
import type { ProviderResult } from '@/lib/providers';
import type { ProviderDispatch } from '@/lib/providers/transport';
import { enqueueTenantJob } from '@/lib/worker/client';
import { isValidTenantId } from '@/lib/tenant/isolation';
import { logger, recordSreIncident } from '@/lib/observability/logger';
import { notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import {
  channelHasAdapter,
  describeChannelReadiness,
  type NotificationChannel,
} from './channels';

export type { NotificationChannel } from './channels';
export {
  LIVE_NOTIFICATION_PROVIDERS,
  SUPPORTED_NOTIFICATION_PROVIDERS,
  channelHasAdapter,
  describeChannelReadiness,
  type ChannelReadiness,
} from './channels';
export type NotificationStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'DEAD_LETTER'
  | 'SUPPRESSED';

export type EnqueueNotificationInput = {
  tenantId: string;
  channel: NotificationChannel;
  recipient: string;
  body: string;
  subject?: string | null;
  recipientUserId?: string | null;
  templateId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  scheduledFor?: Date | string;
  maxAttempts?: number;
  createdBy?: string;
};

export type EnqueueNotificationResult = {
  notificationId: string;
  jobId: string | null;
  status: NotificationStatus;
  existing: boolean;
};

type NotificationRow = {
  id: string;
  tenantId: string;
  jobId: string | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  provider: string;
  recipient: string;
  recipientUserId: string | null;
  subject: string | null;
  body: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

type ProviderSendResult = {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
  status?: NotificationStatus;
  metadata?: Record<string, unknown>;
};

const TERMINAL_STATUSES = new Set<NotificationStatus>(['SENT', 'DELIVERED', 'DEAD_LETTER', 'SUPPRESSED']);

function scheduledDate(value: Date | string | undefined): Date {
  if (!value) return new Date();
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid scheduledFor value.');
  }
  return parsed;
}

export function providerForChannel(channel: NotificationChannel): string {
  return notificationProviderForChannel(channel);
}

/**
 * Refuses to queue anything the deployment cannot actually dispatch.
 *
 * This runs at enqueue time so a caller finds out immediately, rather than a row
 * sitting in the outbox retrying against credentials that do not exist. The error
 * names the environment variables that would fix it.
 */
function assertChannelCanDispatch(channel: NotificationChannel, provider: string): void {
  if (!channelHasAdapter(channel, provider)) {
    throw new Error(
      provider === 'unconfigured'
        ? `${channel} notification provider is not configured. Set ${channel}_PROVIDER.`
        : `${channel} notification provider '${provider}' is not supported.`,
    );
  }

  const readiness = describeChannelReadiness(channel);
  if (!readiness.available) {
    throw new Error(readiness.reason || `${channel} notification provider is not configured.`);
  }
}

function backoffForAttempt(attempt: number): string {
  const minutes = Math.min(60, Math.max(1, attempt * attempt * 2));
  return `${minutes} minutes`;
}

function messageIdFromPayload(payload: Record<string, unknown>): string | null {
  return typeof payload.messageId === 'string' ? payload.messageId : null;
}

async function findExistingNotification(
  tenantId: string,
  idempotencyKey?: string,
): Promise<EnqueueNotificationResult | null> {
  if (!idempotencyKey) return null;

  const { rows } = await pool.query(
    `SELECT id, job_id AS "jobId", status
     FROM notification_outbox
     WHERE tenant_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [tenantId, idempotencyKey],
  );

  if (!rows[0]) return null;
  return {
    notificationId: rows[0].id,
    jobId: rows[0].jobId,
    status: rows[0].status,
    existing: true,
  };
}

async function updateLinkedMessage(params: {
  tenantId: string;
  payload: Record<string, unknown>;
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  providerMessageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const messageId = messageIdFromPayload(params.payload);
  if (!messageId) return;

  // `messages.status` is the `message_status` enum while the CASE arms compare
  // against text literals. Postgres deduces a parameter's type from every site it
  // appears in, so $1 must be spelled `$1::text` everywhere and cast into the enum
  // at the assignment — otherwise the whole statement fails with
  // "inconsistent types deduced for parameter $1" and the update never lands.
  await pool.query(
    `UPDATE messages
     SET status = $1::text::message_status,
         provider_message_id = COALESCE($2, provider_message_id),
         error_message = $3,
         metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
         sent_at = CASE WHEN $1::text IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
         delivered_at = CASE WHEN $1::text = 'DELIVERED' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END
     WHERE tenant_id = $5 AND id = $6`,
    [
      params.status,
      params.providerMessageId || null,
      params.error || null,
      JSON.stringify(params.metadata || {}),
      params.tenantId,
      messageId,
    ],
  );
}

async function recordDeliveryEvent(params: {
  tenantId: string;
  notificationId: string;
  jobId: string | null;
  status: NotificationStatus;
  provider: string;
  providerMessageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  await pool.query(
    `INSERT INTO notification_delivery_events (
        tenant_id, notification_id, job_id, status, provider, provider_message_id, error, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      params.tenantId,
      params.notificationId,
      params.jobId,
      params.status,
      params.provider,
      params.providerMessageId || null,
      params.error || null,
      JSON.stringify(params.metadata || {}),
    ],
  );
}

/**
 * Records a provider DELIVERY RECEIPT for an already-sent notification. Called by
 * the provider status webhook, which carries no tenant session — so it resolves the
 * outbox row (and its tenant) by (provider, provider_message_id) under a reviewed
 * RLS bypass, then records the receipt inside that row's own tenant context.
 *
 * Idempotent: the outbox row is only promoted forward from SENT, so a duplicate or
 * late receipt is a no-op. Returns whether a row matched (an unknown message id is
 * not an error — providers retry, and receipts can arrive for pruned rows).
 */
export async function recordDeliveryReceipt(params: {
  provider: string;
  providerMessageId: string;
  status: 'DELIVERED' | 'FAILED';
  error?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ matched: boolean }> {
  if (!params.providerMessageId) return { matched: false };

  const row = await runWithRlsBypass(
    RLS_BYPASS_JUSTIFICATIONS.NOTIFICATION_RECEIPT,
    async () => {
      const { rows } = await pool.query<{
        id: string;
        tenantId: string;
        jobId: string | null;
        payload: Record<string, unknown> | null;
      }>(
        `SELECT id, tenant_id AS "tenantId", job_id AS "jobId", payload
         FROM notification_outbox
         WHERE provider = $1 AND provider_message_id = $2
         LIMIT 1`,
        [params.provider, params.providerMessageId],
      );
      return rows[0] ?? null;
    },
  );

  if (!row) return { matched: false };

  await runWithTenantContext(row.tenantId, async () => {
    await updateLinkedMessage({
      tenantId: row.tenantId,
      payload: row.payload ?? {},
      status: params.status,
      providerMessageId: params.providerMessageId,
      error: params.error,
      metadata: params.metadata,
    });
    await recordDeliveryEvent({
      tenantId: row.tenantId,
      notificationId: row.id,
      jobId: row.jobId,
      status: params.status,
      provider: params.provider,
      providerMessageId: params.providerMessageId,
      error: params.error,
      metadata: params.metadata,
    });
    // Promote the outbox row itself — only forward from SENT, so a late or
    // duplicate receipt never overwrites a terminal state.
    await pool.query(
      `UPDATE notification_outbox
       SET status = $1, last_error = COALESCE($2, last_error), updated_at = NOW()
       WHERE tenant_id = $3 AND id = $4 AND status = 'SENT'`,
      [params.status, params.error ?? null, row.tenantId, row.id],
    );
  });

  return { matched: true };
}

/**
 * Translates one adapter result into an outbox result.
 *
 * The `!result.data` arm is the load-bearing one: an adapter that claims success
 * without a provider message id has given us no evidence the message left, so it
 * is recorded FAILED. A fee reminder is never marked sent on a guess.
 */
function toSendResult(provider: string, result: ProviderResult<ProviderDispatch>): ProviderSendResult {
  if (!result.success || !result.data?.messageId) {
    return {
      success: false,
      provider,
      error: result.error
        || 'Provider returned success without a message id, so delivery cannot be confirmed.',
    };
  }

  const { messageId, deliveryState, providerStatus } = result.data;
  return {
    success: true,
    provider,
    providerMessageId: messageId,
    // DELIVERED only when the provider confirmed it in this very response;
    // everything else is SENT and waits for a status webhook.
    status: deliveryState === 'DELIVERED' ? 'DELIVERED' : 'SENT',
    metadata: providerStatus ? { providerStatus } : undefined,
  };
}

/**
 * Dispatches one outbox row.
 *
 * MUST run outside a database transaction — every live adapter performs a network
 * call with a timeout of up to `NOTIFICATION_PROVIDER_TIMEOUT_MS`, and holding a
 * Postgres connection (and the row lock) open for that long would stall the pool.
 * `processNotification` commits its attempt claim before calling this.
 */
async function sendViaProvider(row: NotificationRow): Promise<ProviderSendResult> {
  const provider = providerForChannel(row.channel);
  const readiness = describeChannelReadiness(row.channel);

  // An unconfigured channel fails as data, not as an exception, so the caller can
  // record FAILED with a reason an operator can act on.
  if (!readiness.available) {
    logger.warn('notification.channel_unavailable', `${row.channel} channel cannot dispatch`, {
      tenantId: row.tenantId,
      source: 'notifications',
      entityType: 'notification_outbox',
      entityId: row.id,
      metadata: { channel: row.channel, provider, missing: readiness.missing },
    });
    return {
      success: false,
      provider,
      error: readiness.reason || `${row.channel} notification provider is not configured.`,
      metadata: { unavailable: true, missing: readiness.missing },
    };
  }

  switch (row.channel) {
    case 'EMAIL': {
      return toSendResult(provider, await getEmailProvider().send({
        to: row.recipient,
        subject: row.subject || 'School notification',
        html: row.body,
      }));
    }
    case 'SMS': {
      return toSendResult(provider, await getSmsProvider().send(row.recipient, row.body));
    }
    case 'WHATSAPP': {
      // The payload carries the approved template name and variables when the
      // caller has one; the adapter falls back to WHATSAPP_DEFAULT_TEMPLATE.
      return toSendResult(provider, await getWhatsAppProvider().send({
        to: row.recipient,
        body: row.body,
        payload: row.payload || {},
      }));
    }
    case 'PUSH': {
      return toSendResult(provider, await getPushProvider().send({
        deviceToken: row.recipient,
        title: row.subject || 'School notification',
        body: row.body,
        data: row.payload || {},
      }));
    }
    case 'IN_APP': {
      // The row itself is the delivery: it is already committed and readable.
      return {
        success: true,
        provider: 'database',
        providerMessageId: `in_app_${row.id}`,
        status: 'DELIVERED',
        metadata: { stored: true },
      };
    }
    default:
      return {
        success: false,
        provider: 'unconfigured',
        error: `Unsupported notification channel: ${row.channel}`,
      };
  }
}

export async function enqueueNotification(
  input: EnqueueNotificationInput,
): Promise<EnqueueNotificationResult> {
  if (!isValidTenantId(input.tenantId)) {
    throw new Error('Invalid tenant context.');
  }
  if (!input.recipient.trim()) {
    throw new Error('Notification recipient is required.');
  }
  if (!input.body.trim()) {
    throw new Error('Notification body is required.');
  }

  const scheduledFor = scheduledDate(input.scheduledFor);
  const provider = providerForChannel(input.channel);
  assertChannelCanDispatch(input.channel, provider);

  return runWithTenantContext(input.tenantId, async () => {
    const existing = await findExistingNotification(input.tenantId, input.idempotencyKey);
    if (existing) return existing;

    let notificationId: string;
    try {
      const { rows } = await pool.query(
        `INSERT INTO notification_outbox (
            tenant_id, channel, status, provider, recipient, recipient_user_id, subject, body,
            template_id, payload, idempotency_key, scheduled_for, next_attempt_at, max_attempts, created_by
         )
         VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $11, $12, $13)
         RETURNING id, status`,
        [
          input.tenantId,
          input.channel,
          provider,
          input.recipient.trim(),
          input.recipientUserId || null,
          input.subject || null,
          input.body,
          input.templateId || null,
          JSON.stringify(input.payload || {}),
          input.idempotencyKey || null,
          scheduledFor,
          input.maxAttempts ?? 3,
          input.createdBy || null,
        ],
      );
      notificationId = rows[0].id;
    } catch (error: unknown) {
      if ((error as { code?: string } | null)?.code === '23505' && input.idempotencyKey) {
        const existing = await findExistingNotification(input.tenantId, input.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }

    const job = await enqueueTenantJob(
      'send-notification',
      input.tenantId,
      { notificationId },
      {
        idempotencyKey: `notification:${notificationId}`,
        scheduledFor,
        maxAttempts: input.maxAttempts ?? 3,
        createdBy: input.createdBy,
      },
    );

    await pool.query(
      `UPDATE notification_outbox
       SET job_id = $1, status = 'QUEUED', updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [job.jobId, input.tenantId, notificationId],
    );

    return {
      notificationId,
      jobId: job.jobId,
      status: 'QUEUED',
      existing: false,
    };
  });
}

export async function processNotification(notificationId: string, tenantId: string): Promise<ProviderSendResult> {
  if (!isValidTenantId(tenantId)) {
    throw new Error('Invalid tenant context.');
  }

  return runWithTenantContext(tenantId, async () => {
    const client = await pool.connect();
    let row: NotificationRow | null = null;
    let attemptNumber = 0;

    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id,
                tenant_id AS "tenantId",
                job_id AS "jobId",
                channel,
                status,
                provider,
                recipient,
                recipient_user_id AS "recipientUserId",
                subject,
                body,
                payload,
                attempts,
                max_attempts AS "maxAttempts"
         FROM notification_outbox
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, notificationId],
      );

      row = rows[0] || null;
      if (!row) {
        await client.query('COMMIT');
        return { success: false, provider: 'unknown', error: 'Notification not found' };
      }
      if (TERMINAL_STATUSES.has(row.status)) {
        await client.query('COMMIT');
        return { success: true, provider: row.provider, status: row.status, metadata: { skipped: true } };
      }
      if (row.attempts >= row.maxAttempts) {
        await client.query(
          `UPDATE notification_outbox
           SET status = 'DEAD_LETTER', updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, notificationId],
        );
        await client.query('COMMIT');
        await recordSreIncident({
          tenantId,
          severity: 'ERROR',
          source: 'notifications',
          fingerprint: `notification_dead_letter:${notificationId}`,
          title: `Notification dead-lettered: ${row.channel}`,
          description: 'Max attempts exhausted',
          entityType: 'notification_outbox',
          entityId: notificationId,
          metadata: {
            notificationId,
            channel: row.channel,
            provider: row.provider,
            maxAttempts: row.maxAttempts,
          },
        });
        return { success: false, provider: row.provider, status: 'DEAD_LETTER', error: 'Max attempts exhausted' };
      }

      attemptNumber = row.attempts + 1;
      await client.query(
        `UPDATE notification_outbox
         SET status = 'QUEUED', attempts = attempts + 1, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, notificationId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (!row) {
      return { success: false, provider: 'unknown', error: 'Notification not found' };
    }

    try {
      const result = await sendViaProvider(row);
      const finalStatus = result.success ? (result.status || 'SENT') : 'FAILED';
      const terminalFailure = !result.success && attemptNumber >= row.maxAttempts;
      const storedStatus = terminalFailure ? 'DEAD_LETTER' : finalStatus;
      const nextAttemptSql = result.success ? 'NULL' : `NOW() + INTERVAL '${backoffForAttempt(attemptNumber)}'`;

      // $1 is referenced both as an assignment target and inside a text comparison;
      // spelling it `$1::text` at every site keeps Postgres from deducing two
      // different types for the same parameter and rejecting the statement.
      await pool.query(
        `UPDATE notification_outbox
         SET status = $1::text,
             provider = $2,
             provider_message_id = COALESCE($3, provider_message_id),
             last_error = $4,
             next_attempt_at = COALESCE(${nextAttemptSql}, next_attempt_at),
             sent_at = CASE WHEN $1::text IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
             updated_at = NOW()
         WHERE tenant_id = $5 AND id = $6`,
        [
          storedStatus,
          result.provider,
          result.providerMessageId || null,
          result.error || null,
          tenantId,
          notificationId,
        ],
      );

      await recordDeliveryEvent({
        tenantId,
        notificationId,
        jobId: row.jobId,
        status: storedStatus,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        error: result.error,
        metadata: result.metadata,
      });

      if (storedStatus === 'DEAD_LETTER') {
        await recordSreIncident({
          tenantId,
          severity: 'ERROR',
          source: 'notifications',
          fingerprint: `notification_dead_letter:${notificationId}`,
          title: `Notification dead-lettered: ${row.channel}`,
          description: result.error || 'Provider delivery failed',
          entityType: 'notification_outbox',
          entityId: notificationId,
          metadata: {
            notificationId,
            jobId: row.jobId,
            channel: row.channel,
            provider: result.provider,
            attemptNumber,
            maxAttempts: row.maxAttempts,
          },
        });
      }

      await updateLinkedMessage({
        tenantId,
        payload: row.payload || {},
        status: storedStatus === 'DELIVERED' ? 'DELIVERED' : storedStatus === 'SENT' ? 'SENT' : 'FAILED',
        providerMessageId: result.providerMessageId,
        error: result.error,
        metadata: { notificationId, provider: result.provider, status: storedStatus },
      });

      return { ...result, status: storedStatus };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notification delivery failed';
      const terminalFailure = attemptNumber >= row.maxAttempts;
      const storedStatus: NotificationStatus = terminalFailure ? 'DEAD_LETTER' : 'FAILED';

      await pool.query(
        `UPDATE notification_outbox
         SET status = $1,
             last_error = $2,
             next_attempt_at = NOW() + INTERVAL '${backoffForAttempt(attemptNumber)}',
             updated_at = NOW()
         WHERE tenant_id = $3 AND id = $4`,
        [storedStatus, message, tenantId, notificationId],
      );

      await recordDeliveryEvent({
        tenantId,
        notificationId,
        jobId: row.jobId,
        status: storedStatus,
        provider: row.provider,
        error: message,
      });

      if (storedStatus === 'DEAD_LETTER') {
        await recordSreIncident({
          tenantId,
          severity: 'ERROR',
          source: 'notifications',
          fingerprint: `notification_dead_letter:${notificationId}`,
          title: `Notification dead-lettered: ${row.channel}`,
          description: message,
          entityType: 'notification_outbox',
          entityId: notificationId,
          metadata: {
            notificationId,
            jobId: row.jobId,
            channel: row.channel,
            provider: row.provider,
            attemptNumber,
            maxAttempts: row.maxAttempts,
          },
        });
      }

      await updateLinkedMessage({
        tenantId,
        payload: row.payload || {},
        status: 'FAILED',
        error: message,
        metadata: { notificationId, provider: row.provider, status: storedStatus },
      });

      return { success: false, provider: row.provider, status: storedStatus, error: message };
    }
  });
}

export async function processDueNotifications(limit = 25): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const result = await runWithRlsBypass<QueryResult<{ id: string; tenantId: string }>>(
    RLS_BYPASS_JUSTIFICATIONS.NOTIFICATION_SWEEP,
    () => pool.query(
    `SELECT id, tenant_id AS "tenantId"
     FROM notification_outbox
     WHERE status IN ('PENDING', 'QUEUED', 'FAILED')
       AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at ASC, created_at ASC
     LIMIT $1`,
    [limit],
    ),
  );
  const rows = result.rows;

  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processNotification(row.id, row.tenantId);
    if (result.success) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return { processed: rows.length, succeeded, failed };
}
