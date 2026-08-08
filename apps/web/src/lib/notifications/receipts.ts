import crypto from 'crypto';
import type { QueryResult } from 'pg';
import {
  pool,
  RLS_BYPASS_JUSTIFICATIONS,
  runWithRlsBypass,
  runWithTenantContext,
} from '@/lib/db';
import type { NotificationStatus } from './outbox';

export type ReceiptProvider = 'twilio' | 'resend' | 'msg91' | 'firebase' | 'smtp';
export type ReceiptStatus = Extract<NotificationStatus, 'SENT' | 'DELIVERED' | 'FAILED' | 'SUPPRESSED'>;

export type NotificationReceipt = {
  provider: ReceiptProvider;
  providerMessageId: string;
  status: ReceiptStatus;
  externalEventId: string;
  occurredAt: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type AppliedReceipt = {
  notificationId: string;
  tenantId: string;
  status: NotificationStatus;
  duplicate: boolean;
  ignoredAsStale: boolean;
};

const RECEIPT_WINDOW_SECONDS = 5 * 60;
const MAX_IDENTIFIER_LENGTH = 255;
const RECEIPT_STATUSES = new Set<ReceiptStatus>(['SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED']);

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requiredString(value: unknown, field: string, maxLength = MAX_IDENTIFIER_LENGTH): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized;
}

function validOccurredAt(value: unknown): string {
  const date = typeof value === 'string' ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Receipt occurredAt is invalid.');
  return date.toISOString();
}

export function verifyTwilioReceiptSignature(
  rawBody: string,
  signature: string,
  callbackUrl = process.env.NOTIFICATION_TWILIO_STATUS_CALLBACK_URL || '',
  authToken = process.env.TWILIO_AUTH_TOKEN || '',
): boolean {
  if (!signature || !callbackUrl || !authToken) return false;
  const params = [...new URLSearchParams(rawBody).entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const signed = callbackUrl + params.map(([key, value]) => `${key}${value}`).join('');
  const expected = crypto.createHmac('sha1', authToken).update(signed).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return safeEqual(expected, actual);
}

export function verifyResendReceiptSignature(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  webhookSecret = process.env.RESEND_WEBHOOK_SECRET || '',
  nowMs = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature || !webhookSecret) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(nowMs / 1000) - timestamp) > RECEIPT_WINDOW_SECONDS) {
    return false;
  }

  const encodedSecret = webhookSecret.startsWith('whsec_') ? webhookSecret.slice('whsec_'.length) : webhookSecret;
  let secret: Buffer;
  try {
    secret = Buffer.from(encodedSecret, 'base64');
  } catch {
    return false;
  }
  if (secret.length < 16) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest();

  return headers.signature.split(' ').some((candidate) => {
    const [version, encoded] = candidate.split(',', 2);
    if (version !== 'v1' || !encoded) return false;
    try {
      return safeEqual(expected, Buffer.from(encoded, 'base64'));
    } catch {
      return false;
    }
  });
}

export function verifyBridgeReceiptSignature(
  rawBody: string,
  signature: string,
  secret = process.env.NOTIFICATION_RECEIPT_WEBHOOK_SECRET || '',
): boolean {
  if (!signature || !secret) return false;
  const encoded = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  if (!/^[0-9a-f]{64}$/i.test(encoded)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return safeEqual(expected, Buffer.from(encoded, 'hex'));
}

export function parseTwilioReceipt(rawBody: string): NotificationReceipt {
  const values = new URLSearchParams(rawBody);
  const providerMessageId = requiredString(values.get('MessageSid') || values.get('SmsSid'), 'MessageSid');
  const providerStatus = requiredString(values.get('MessageStatus') || values.get('SmsStatus'), 'MessageStatus').toLowerCase();
  const errorCode = values.get('ErrorCode') || undefined;
  const channelStatusMessage = values.get('ChannelStatusMessage') || undefined;
  const eventType = values.get('EventType') || undefined;
  const status: ReceiptStatus = providerStatus === 'delivered' || providerStatus === 'read'
    ? 'DELIVERED'
    : providerStatus === 'failed' || providerStatus === 'undelivered'
      ? 'FAILED'
      : providerStatus === 'canceled'
        ? 'SUPPRESSED'
        : 'SENT';
  const identitySuffix = values.get('RawDlrDoneDate') || eventType || errorCode || providerStatus;

  return {
    provider: 'twilio',
    providerMessageId,
    status,
    externalEventId: `twilio:${providerMessageId}:${providerStatus}:${identitySuffix}`.slice(0, MAX_IDENTIFIER_LENGTH),
    occurredAt: new Date().toISOString(),
    error: status === 'FAILED' ? channelStatusMessage || (errorCode ? `Twilio error ${errorCode}` : 'Twilio delivery failed.') : undefined,
    metadata: {
      providerStatus,
      ...(errorCode ? { errorCode } : {}),
      ...(eventType ? { eventType } : {}),
      ...(values.get('ChannelPrefix') ? { channelPrefix: values.get('ChannelPrefix') } : {}),
      ...(values.get('RawDlrDoneDate') ? { rawDlrDoneDate: values.get('RawDlrDoneDate') } : {}),
    },
  };
}

export function parseResendReceipt(rawBody: string, eventId: string): NotificationReceipt | null {
  const payload = JSON.parse(rawBody) as {
    type?: unknown;
    created_at?: unknown;
    data?: { email_id?: unknown; bounce?: unknown };
  };
  const type = requiredString(payload.type, 'type', 100).toLowerCase();
  const providerMessageId = requiredString(payload.data?.email_id, 'data.email_id');
  const status: ReceiptStatus | null = type === 'email.delivered'
    ? 'DELIVERED'
    : type === 'email.failed' || type === 'email.bounced'
      ? 'FAILED'
      : type === 'email.suppressed' || type === 'email.complained'
        ? 'SUPPRESSED'
        : type === 'email.sent'
          ? 'SENT'
          : null;
  if (!status) return null;

  return {
    provider: 'resend',
    providerMessageId,
    status,
    externalEventId: requiredString(eventId, 'svix-id'),
    occurredAt: validOccurredAt(payload.created_at),
    error: status === 'FAILED' ? `Resend reported ${type}.` : undefined,
    metadata: { eventType: type, ...(payload.data?.bounce ? { bounce: payload.data.bounce } : {}) },
  };
}

export function parseBridgeReceipt(rawBody: string, provider: Exclude<ReceiptProvider, 'twilio' | 'resend'>): NotificationReceipt {
  const payload = JSON.parse(rawBody) as {
    providerMessageId?: unknown;
    status?: unknown;
    eventId?: unknown;
    occurredAt?: unknown;
    error?: unknown;
    metadata?: unknown;
  };
  const status = requiredString(payload.status, 'status', 30).toUpperCase() as ReceiptStatus;
  if (!RECEIPT_STATUSES.has(status)) throw new Error(`Unsupported receipt status: ${status}.`);

  return {
    provider,
    providerMessageId: requiredString(payload.providerMessageId, 'providerMessageId'),
    status,
    externalEventId: requiredString(payload.eventId, 'eventId'),
    occurredAt: validOccurredAt(payload.occurredAt),
    error: typeof payload.error === 'string' ? payload.error.slice(0, 2_000) : undefined,
    metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? payload.metadata as Record<string, unknown>
      : {},
  };
}

type LookupRow = { tenantId: string; notificationId: string };

export async function applyNotificationReceipt(receipt: NotificationReceipt): Promise<AppliedReceipt> {
  const lookup = await runWithRlsBypass<QueryResult<LookupRow>>(
    RLS_BYPASS_JUSTIFICATIONS.PROVIDER_NOTIFICATION_LOOKUP,
    () => pool.query<LookupRow>(
      `SELECT tenant_id AS "tenantId", id AS "notificationId"
       FROM notification_outbox
       WHERE provider = $1 AND provider_message_id = $2
       LIMIT 2`,
      [receipt.provider, receipt.providerMessageId],
    ),
  );
  if (lookup.rows.length === 0) throw new Error('Notification for provider receipt was not found.');
  if (lookup.rows.length > 1) throw new Error('Provider message identifier is not unique.');

  const located = lookup.rows[0];
  return runWithTenantContext(located.tenantId, async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rowResult = await client.query<{
        id: string;
        tenantId: string;
        jobId: string | null;
        status: NotificationStatus;
        payload: Record<string, unknown>;
      }>(
        `SELECT id, tenant_id AS "tenantId", job_id AS "jobId", status, payload
         FROM notification_outbox
         WHERE tenant_id = $1 AND id = $2 AND provider = $3 AND provider_message_id = $4
         FOR UPDATE`,
        [located.tenantId, located.notificationId, receipt.provider, receipt.providerMessageId],
      );
      const row = rowResult.rows[0];
      if (!row) throw new Error('Notification for provider receipt was not found.');

      const duplicateResult = await client.query(
        `SELECT 1
         FROM notification_delivery_events
         WHERE tenant_id = $1 AND notification_id = $2
           AND metadata ->> 'externalEventId' = $3
         LIMIT 1`,
        [row.tenantId, row.id, receipt.externalEventId],
      );
      if (duplicateResult.rowCount) {
        await client.query('COMMIT');
        return {
          notificationId: row.id,
          tenantId: row.tenantId,
          status: row.status,
          duplicate: true,
          ignoredAsStale: false,
        };
      }

      const lastReceiptResult = await client.query<{ occurredAt: string | null }>(
        `SELECT MAX(metadata ->> 'receiptOccurredAt') AS "occurredAt"
         FROM notification_delivery_events
         WHERE tenant_id = $1 AND notification_id = $2
           AND metadata ? 'receiptOccurredAt'`,
        [row.tenantId, row.id],
      );
      const previousOccurredAt = lastReceiptResult.rows[0]?.occurredAt;
      const staleByTimestamp = Boolean(previousOccurredAt && new Date(previousOccurredAt) > new Date(receipt.occurredAt));
      const staleSentDowngrade = receipt.status === 'SENT' && ['DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED'].includes(row.status);
      const deliveredDowngrade = row.status === 'DELIVERED' && receipt.status !== 'DELIVERED';
      const ignoredAsStale = staleByTimestamp || staleSentDowngrade || deliveredDowngrade;
      const storedStatus = ignoredAsStale ? row.status : receipt.status;

      if (!ignoredAsStale) {
        await client.query(
          `UPDATE notification_outbox
           SET status = $1,
               last_error = $2,
               sent_at = CASE WHEN $1 IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
               updated_at = NOW()
           WHERE tenant_id = $3 AND id = $4`,
          [receipt.status, receipt.error || null, row.tenantId, row.id],
        );
      }

      const eventMetadata = {
        ...(receipt.metadata || {}),
        externalEventId: receipt.externalEventId,
        receiptOccurredAt: receipt.occurredAt,
        receiptAuthenticated: true,
        ...(ignoredAsStale ? { ignoredAsStale: true, retainedStatus: row.status } : {}),
      };
      await client.query(
        `INSERT INTO notification_delivery_events (
            tenant_id, notification_id, job_id, status, provider, provider_message_id, error, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          row.tenantId,
          row.id,
          row.jobId,
          receipt.status,
          receipt.provider,
          receipt.providerMessageId,
          receipt.error || null,
          JSON.stringify(eventMetadata),
        ],
      );

      const messageId = typeof row.payload?.messageId === 'string' ? row.payload.messageId : null;
      if (messageId && !ignoredAsStale) {
        const linkedStatus = receipt.status === 'DELIVERED' ? 'DELIVERED' : receipt.status === 'SENT' ? 'SENT' : 'FAILED';
        await client.query(
          `UPDATE messages
           SET status = $1,
               provider_message_id = COALESCE($2, provider_message_id),
               error_message = $3,
               metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
               sent_at = CASE WHEN $1 IN ('SENT', 'DELIVERED') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
               delivered_at = CASE WHEN $1 = 'DELIVERED' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END
           WHERE tenant_id = $5 AND id = $6`,
          [
            linkedStatus,
            receipt.providerMessageId,
            receipt.error || null,
            JSON.stringify({ notificationReceipt: eventMetadata, notificationStatus: receipt.status }),
            row.tenantId,
            messageId,
          ],
        );
      }

      await client.query('COMMIT');
      return {
        notificationId: row.id,
        tenantId: row.tenantId,
        status: storedStatus,
        duplicate: false,
        ignoredAsStale,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
