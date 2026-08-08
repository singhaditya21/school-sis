import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import type { PoolClient, QueryResult } from 'pg';
import { getEmailProvider } from '@/lib/providers/email';
import { getSmsProvider } from '@/lib/providers/sms';
import { getWhatsAppProvider } from '@/lib/providers/whatsapp';
import { getPushProvider } from '@/lib/providers/push';
import { enqueueTenantJob } from '@/lib/worker/client';
import { isValidTenantId } from '@/lib/tenant/isolation';
import { recordSreIncident } from '@/lib/observability/logger';
import {
  mockRuntimeIsAllowed,
  notificationProviderForChannel,
} from '@/lib/integrations/runtime-mode';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';
export type NotificationStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
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
  outcome?: 'REJECTED' | 'UNKNOWN';
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

function assertSupportedProvider(channel: NotificationChannel, provider: string): void {
  const supported: Record<NotificationChannel, readonly string[]> = {
    EMAIL: ['smtp', 'resend', 'mock'],
    SMS: ['msg91', 'twilio', 'mock'],
    WHATSAPP: ['twilio', 'mock'],
    PUSH: ['firebase', 'mock'],
    IN_APP: ['database'],
  };
  if (provider === 'unconfigured') {
    throw new Error(`${channel} notification provider is not configured.`);
  }
  if (!supported[channel].includes(provider)) {
    throw new Error(`${channel} notification provider '${provider}' is not supported.`);
  }
  if (provider === 'mock' && !mockRuntimeIsAllowed()) {
    throw new Error(`${channel} mock notification provider is disabled in this runtime.`);
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
}, client?: PoolClient) {
  const messageId = messageIdFromPayload(params.payload);
  if (!messageId) return;

  const sql =
    `UPDATE messages
     SET status = CASE
           WHEN status = 'DELIVERED' AND $1 <> 'DELIVERED' THEN status
           ELSE $1
         END,
         provider_message_id = COALESCE($2, provider_message_id),
         error_message = CASE
           WHEN status = 'DELIVERED' AND $1 <> 'DELIVERED' THEN error_message
           ELSE $3
         END,
         metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
         sent_at = CASE WHEN $1 IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
         delivered_at = CASE WHEN $1 = 'DELIVERED' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END
     WHERE tenant_id = $5 AND id = $6`;
  const values = [
    params.status,
    params.providerMessageId || null,
    params.error || null,
    JSON.stringify(params.metadata || {}),
    params.tenantId,
    messageId,
  ];
  if (client) await client.query(sql, values);
  else await pool.query(sql, values);
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
}, client?: PoolClient) {
  const sql =
    `INSERT INTO notification_delivery_events (
        tenant_id, notification_id, job_id, status, provider, provider_message_id, error, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`;
  const values = [
    params.tenantId,
    params.notificationId,
    params.jobId,
    params.status,
    params.provider,
    params.providerMessageId || null,
    params.error || null,
    JSON.stringify(params.metadata || {}),
  ];
  if (client) await client.query(sql, values);
  else await pool.query(sql, values);
}

async function sendViaProvider(row: NotificationRow): Promise<ProviderSendResult> {
  assertSupportedProvider(row.channel, providerForChannel(row.channel));
  switch (row.channel) {
    case 'EMAIL': {
      const provider = getEmailProvider();
      const result = await provider.send({
        to: row.recipient,
        subject: row.subject || 'School notification',
        html: row.body,
      });
      return {
        success: result.success,
        provider: providerForChannel(row.channel),
        providerMessageId: result.data?.messageId,
        error: result.error,
        outcome: result.outcome,
        status: 'SENT',
      };
    }
    case 'SMS': {
      const provider = getSmsProvider();
      const result = await provider.send(row.recipient, row.body);
      return {
        success: result.success,
        provider: providerForChannel(row.channel),
        providerMessageId: result.data?.messageId,
        error: result.error,
        outcome: result.outcome,
        status: 'SENT',
      };
    }
    case 'WHATSAPP': {
      const provider = providerForChannel(row.channel);
      const result = await getWhatsAppProvider().send(row.recipient, row.body);
      return {
        success: result.success,
        provider,
        providerMessageId: result.data?.messageId,
        error: result.error,
        outcome: result.outcome,
        status: 'SENT',
      };
    }
    case 'PUSH': {
      const provider = providerForChannel(row.channel);
      const result = await getPushProvider().send({
        token: row.recipient,
        title: row.subject || 'School notification',
        body: row.body,
        data: row.payload,
      });
      return {
        success: result.success,
        provider,
        providerMessageId: result.data?.messageId,
        error: result.error,
        outcome: result.outcome,
        status: 'SENT',
      };
    }
    case 'IN_APP': {
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
  assertSupportedProvider(input.channel, provider);

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

async function recordNotificationIncident(
  incident: Parameters<typeof recordSreIncident>[0],
): Promise<void> {
  try {
    await recordSreIncident(incident);
  } catch {
    // Delivery state is authoritative. An observability write must never alter retry semantics.
  }
}

async function persistProviderOutcome(
  row: NotificationRow,
  attemptNumber: number,
  result: ProviderSendResult,
): Promise<NotificationStatus> {
  const finalStatus = result.success ? (result.status || 'SENT') : 'FAILED';
  const terminalFailure = !result.success && attemptNumber >= row.maxAttempts;
  const storedStatus: NotificationStatus = terminalFailure ? 'DEAD_LETTER' : finalStatus;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const updateResult = await client.query<{ status: NotificationStatus }>(
      `UPDATE notification_outbox
       SET status = $1,
           provider = $2,
           provider_message_id = COALESCE($3, provider_message_id),
           last_error = $4,
           next_attempt_at = CASE
             WHEN $1 IN ('SENT', 'DELIVERED') THEN next_attempt_at
             ELSE NOW() + $5::interval
           END,
           sent_at = CASE
             WHEN $1 IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW())
             ELSE sent_at
           END,
           updated_at = NOW()
       WHERE tenant_id = $6 AND id = $7 AND status = 'PROCESSING'
       RETURNING status`,
      [
        storedStatus,
        result.provider,
        result.providerMessageId || null,
        result.error || null,
        backoffForAttempt(attemptNumber),
        row.tenantId,
        row.id,
      ],
    );
    if (updateResult.rowCount !== 1) {
      throw new Error('Notification delivery claim was lost before provider outcome bookkeeping.');
    }

    await recordDeliveryEvent({
      tenantId: row.tenantId,
      notificationId: row.id,
      jobId: row.jobId,
      status: storedStatus,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      error: result.error,
      metadata: {
        ...(result.metadata || {}),
        attemptNumber,
        claimedStatus: 'PROCESSING',
      },
    }, client);

    await updateLinkedMessage({
      tenantId: row.tenantId,
      payload: row.payload || {},
      status: storedStatus === 'DELIVERED' ? 'DELIVERED' : storedStatus === 'SENT' ? 'SENT' : 'FAILED',
      providerMessageId: result.providerMessageId,
      error: result.error,
      metadata: { notificationId: row.id, provider: result.provider, status: storedStatus },
    }, client);

    await client.query('COMMIT');
    return storedStatus;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original bookkeeping failure for the reconciliation incident.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function processNotification(notificationId: string, tenantId: string): Promise<ProviderSendResult> {
  if (!isValidTenantId(tenantId)) {
    throw new Error('Invalid tenant context.');
  }

  return runWithTenantContext(tenantId, async () => {
    const claimResult = await pool.query<NotificationRow>(
      `UPDATE notification_outbox
       SET status = 'PROCESSING',
           attempts = attempts + 1,
           last_error = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2
         AND status IN ('PENDING', 'QUEUED', 'FAILED')
         AND attempts < max_attempts
       RETURNING id,
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
                 max_attempts AS "maxAttempts"`,
      [tenantId, notificationId],
    );
    const row = claimResult.rows[0] || null;

    if (!row) {
      const currentResult = await pool.query<Pick<NotificationRow, 'channel' | 'status' | 'provider' | 'attempts' | 'maxAttempts'>>(
        `SELECT channel, status, provider, attempts, max_attempts AS "maxAttempts"
         FROM notification_outbox
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, notificationId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        return { success: false, provider: 'unknown', error: 'Notification not found' };
      }
      if (TERMINAL_STATUSES.has(current.status) || current.status === 'PROCESSING') {
        return {
          success: true,
          provider: current.provider,
          status: current.status,
          metadata: { skipped: true, claimHeld: current.status === 'PROCESSING' },
        };
      }

      if (current.attempts >= current.maxAttempts) {
        const exhaustedResult = await pool.query(
          `UPDATE notification_outbox
           SET status = 'DEAD_LETTER', updated_at = NOW()
           WHERE tenant_id = $1
             AND id = $2
             AND status IN ('PENDING', 'QUEUED', 'FAILED')
             AND attempts >= max_attempts
           RETURNING id`,
          [tenantId, notificationId],
        );
        if (exhaustedResult.rowCount === 1) {
          await recordNotificationIncident({
            tenantId,
            severity: 'ERROR',
            source: 'notifications',
            fingerprint: `notification_dead_letter:${notificationId}`,
            title: `Notification dead-lettered: ${current.channel}`,
            description: 'Max attempts exhausted',
            entityType: 'notification_outbox',
            entityId: notificationId,
            metadata: {
              notificationId,
              channel: current.channel,
              provider: current.provider,
              maxAttempts: current.maxAttempts,
            },
          });
          return {
            success: false,
            provider: current.provider,
            status: 'DEAD_LETTER',
            error: 'Max attempts exhausted',
          };
        }
      }

      return {
        success: true,
        provider: current.provider,
        status: current.status,
        metadata: { skipped: true, claimContended: true },
      };
    }

    const attemptNumber = row.attempts;
    let result: ProviderSendResult;
    try {
      result = await sendViaProvider(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notification provider outcome is unknown.';
      await recordNotificationIncident({
        tenantId,
        severity: 'CRITICAL',
        source: 'notifications',
        fingerprint: `notification_delivery_unknown:${notificationId}`,
        title: `Notification delivery state unknown: ${row.channel}`,
        description: message,
        entityType: 'notification_outbox',
        entityId: notificationId,
        metadata: {
          notificationId,
          jobId: row.jobId,
          channel: row.channel,
          provider: row.provider,
          attemptNumber,
          reconciliationRequired: true,
        },
      });
      return {
        success: false,
        provider: row.provider,
        status: 'PROCESSING',
        error: 'Provider outcome is unknown; notification requires operator reconciliation.',
        metadata: { deliveryStateUnknown: true, reconciliationRequired: true },
      };
    }

    if (!result.success && result.outcome === 'UNKNOWN') {
      await recordNotificationIncident({
        tenantId,
        severity: 'CRITICAL',
        source: 'notifications',
        fingerprint: `notification_delivery_unknown:${notificationId}`,
        title: `Notification delivery state unknown: ${row.channel}`,
        description: result.error || 'The provider transport outcome is unknown.',
        entityType: 'notification_outbox',
        entityId: notificationId,
        metadata: {
          notificationId,
          jobId: row.jobId,
          channel: row.channel,
          provider: result.provider,
          providerMessageId: result.providerMessageId || null,
          attemptNumber,
          reconciliationRequired: true,
        },
      });
      return {
        ...result,
        status: 'PROCESSING',
        error: 'Provider transport outcome is unknown; automatic retry is blocked.',
        metadata: {
          ...(result.metadata || {}),
          deliveryStateUnknown: true,
          reconciliationRequired: true,
        },
      };
    }

    try {
      const storedStatus = await persistProviderOutcome(row, attemptNumber, result);
      if (storedStatus === 'DEAD_LETTER') {
        await recordNotificationIncident({
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
      return { ...result, status: storedStatus };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider outcome bookkeeping failed.';
      await recordNotificationIncident({
        tenantId,
        severity: 'CRITICAL',
        source: 'notifications',
        fingerprint: `notification_bookkeeping_unknown:${notificationId}`,
        title: `Notification bookkeeping requires reconciliation: ${row.channel}`,
        description: message,
        entityType: 'notification_outbox',
        entityId: notificationId,
        metadata: {
          notificationId,
          jobId: row.jobId,
          channel: row.channel,
          provider: result.provider,
          providerAccepted: result.success,
          providerMessageId: result.providerMessageId || null,
          providerMessageIdPresent: Boolean(result.providerMessageId),
          attemptNumber,
          reconciliationRequired: true,
        },
      });
      return {
        success: false,
        provider: result.provider,
        status: 'PROCESSING',
        error: result.success
          ? 'Provider accepted the notification, but bookkeeping is unconfirmed; automatic retry is blocked.'
          : 'Provider outcome bookkeeping is unconfirmed; automatic retry is blocked.',
        metadata: {
          ...(result.metadata || {}),
          providerAccepted: result.success,
          deliveryStateUnknown: true,
          reconciliationRequired: true,
        },
      };
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
       AND NOT EXISTS (
         SELECT 1
         FROM notification_delivery_events receipt
         WHERE receipt.notification_id = notification_outbox.id
           AND receipt.tenant_id = notification_outbox.tenant_id
           AND receipt.status IN ('FAILED', 'SUPPRESSED')
           AND receipt.metadata ->> 'receiptAuthenticated' = 'true'
       )
     ORDER BY next_attempt_at ASC, created_at ASC
     LIMIT $1`,
    [limit],
    ),
  );
  const rows = result.rows;

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processNotification(row.id, row.tenantId);
    if (result.metadata?.skipped) continue;
    processed += 1;
    if (result.success) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return { processed, succeeded, failed };
}
