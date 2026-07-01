import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import type { QueryResult } from 'pg';
import { getEmailProvider } from '@/lib/providers/email';
import { getSmsProvider } from '@/lib/providers/sms';
import { NotificationService } from '@/lib/services/notifications';
import { enqueueTenantJob } from '@/lib/worker/client';
import { isValidTenantId } from '@/lib/tenant/isolation';
import { recordSreIncident } from '@/lib/observability/logger';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';
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

function providerForChannel(channel: NotificationChannel): string {
  switch (channel) {
    case 'EMAIL':
      return process.env.EMAIL_PROVIDER || 'mock';
    case 'SMS':
      return process.env.SMS_PROVIDER || 'mock';
    case 'WHATSAPP':
      return process.env.WHATSAPP_PROVIDER || 'mock';
    case 'PUSH':
      return process.env.PUSH_PROVIDER || 'mock';
    case 'IN_APP':
      return 'database';
    default:
      return 'mock';
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

  await pool.query(
    `UPDATE messages
     SET status = $1,
         provider_message_id = COALESCE($2, provider_message_id),
         error_message = $3,
         metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
         sent_at = CASE WHEN $1 IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
         delivered_at = CASE WHEN $1 = 'DELIVERED' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END
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

async function sendViaProvider(row: NotificationRow): Promise<ProviderSendResult> {
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
        status: 'SENT',
      };
    }
    case 'WHATSAPP': {
      const providerMessageId = `mock_whatsapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[MockWhatsApp] -> ${row.recipient}: ${row.body.slice(0, 120)}`);
      return {
        success: true,
        provider: providerForChannel(row.channel),
        providerMessageId,
        status: 'SENT',
        metadata: { mock: true },
      };
    }
    case 'PUSH': {
      if (process.env.PUSH_PROVIDER === 'firebase') {
        const response = await NotificationService.sendParentAlert(
          row.recipient,
          row.subject || 'School notification',
          row.body,
          row.payload,
        );
        return {
          success: response.success,
          provider: 'firebase',
          providerMessageId: response.messageId,
          status: 'SENT',
        };
      }

      const providerMessageId = `mock_push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[MockPush] -> ${row.recipient}: ${row.subject || 'School notification'}`);
      return {
        success: true,
        provider: providerForChannel(row.channel),
        providerMessageId,
        status: 'SENT',
        metadata: { mock: true },
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
        provider: 'mock',
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
    } catch (error: any) {
      if (error?.code === '23505' && input.idempotencyKey) {
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

      await pool.query(
        `UPDATE notification_outbox
         SET status = $1,
             provider = $2,
             provider_message_id = COALESCE($3, provider_message_id),
             last_error = $4,
             next_attempt_at = COALESCE(${nextAttemptSql}, next_attempt_at),
             sent_at = CASE WHEN $1 IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
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
  const result = await runWithRlsBypass<QueryResult<{ id: string; tenantId: string }>>(() => pool.query(
    `SELECT id, tenant_id AS "tenantId"
     FROM notification_outbox
     WHERE status IN ('PENDING', 'QUEUED', 'FAILED')
       AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at ASC, created_at ASC
     LIMIT $1`,
    [limit],
  ));
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
