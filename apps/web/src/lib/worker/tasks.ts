import { createHmac } from 'node:crypto';
import { pool } from '@/lib/db';
import { decryptFieldTolerant } from '@/lib/encryption';
import {
  enqueueNotification,
  processDueNotifications,
  processNotification,
  type NotificationChannel,
} from '@/lib/notifications/outbox';
import { getTenantIdFromJobPayload } from '@/lib/tenant/isolation';
import { logger } from '@/lib/observability/logger';

type TaskHandler = (payload: Record<string, unknown>) => Promise<unknown>;

type MarketingLeadRow = {
  id: string;
  contactName: string;
  contactEmail: string | null;
  contactEmailEnc: string | null;
  schoolName: string;
  studentCapacity: number;
  painPoints: string | null;
  consentedAt: Date;
  consentVersion: string;
  sourceUrl: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

function stringValue(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Task payload is missing ${key}.`);
  }
  return value;
}

function optionalStringValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function markLeadCrmFailure(leadId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE marketing_leads
        SET crm_status = 'FAILED', crm_last_attempt_at = NOW(), crm_error = $1
      WHERE id = $2`,
    [error.slice(0, 2_000), leadId],
  );
}

export async function routeMarketingLead(payload: Record<string, unknown>): Promise<unknown> {
  const leadId = stringValue(payload, 'leadId');
  const webhookUrl = process.env.LEAD_CRM_WEBHOOK_URL;
  const webhookSecret = process.env.LEAD_CRM_WEBHOOK_SECRET;

  try {
    if (!webhookUrl) throw new Error('LEAD_CRM_WEBHOOK_URL is not configured.');
    const parsedUrl = new URL(webhookUrl);
    if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
      throw new Error('LEAD_CRM_WEBHOOK_URL must use HTTPS in production.');
    }
    if (webhookSecret && webhookSecret.length < 32) {
      throw new Error('LEAD_CRM_WEBHOOK_SECRET must be at least 32 characters.');
    }

    const { rows } = await pool.query<MarketingLeadRow>(
      `SELECT id,
              contact_name AS "contactName",
              contact_email AS "contactEmail",
              contact_email_enc AS "contactEmailEnc",
              school_name AS "schoolName",
              student_capacity AS "studentCapacity",
              pain_points AS "painPoints",
              consented_at AS "consentedAt",
              consent_version AS "consentVersion",
              source_url AS "sourceUrl",
              referrer,
              utm_source AS "utmSource",
              utm_medium AS "utmMedium",
              utm_campaign AS "utmCampaign"
         FROM marketing_leads
        WHERE id = $1
        LIMIT 1`,
      [leadId],
    );
    const lead = rows[0];
    if (!lead) throw new Error('Marketing lead no longer exists.');

    const body = JSON.stringify({
      id: lead.id,
      contactName: lead.contactName,
      contactEmail: decryptFieldTolerant(lead.contactEmailEnc || lead.contactEmail),
      schoolName: lead.schoolName,
      studentCapacity: lead.studentCapacity,
      painPoints: lead.painPoints,
      consentedAt: lead.consentedAt,
      consentVersion: lead.consentVersion,
      sourceUrl: lead.sourceUrl,
      referrer: lead.referrer,
      attribution: {
        source: lead.utmSource,
        medium: lead.utmMedium,
        campaign: lead.utmCampaign,
      },
    });
    const signature = webhookSecret
      ? createHmac('sha256', webhookSecret).update(body).digest('hex')
      : null;
    const response = await fetch(parsedUrl, {
      method: 'POST',
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'x-scholarmind-signature': `sha256=${signature}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`CRM webhook returned HTTP ${response.status}.`);
    }

    await pool.query(
      `UPDATE marketing_leads
          SET crm_status = 'ROUTED', crm_last_attempt_at = NOW(), crm_error = NULL
        WHERE id = $1`,
      [leadId],
    );
    return { leadId, routed: true, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CRM routing failed.';
    await markLeadCrmFailure(leadId, message);
    throw error;
  }
}

/**
 * Task definitions for the database dispatcher.
 */
export const tasks: Record<string, TaskHandler> = {
  /**
   * Processes the IoT attendance scan and queues a parent push notification.
   */
  'process-iot-attendance-scan': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    const { studentId, timestamp, hardwareType } = payload;

    // In a real app, query the database to find the parent's Firebase Device Token
    const parentRes = await pool.query(
      `SELECT u.fcm_token
       FROM guardians g
       JOIN users u ON u.id = g.user_id AND u.tenant_id = g.tenant_id
       WHERE g.student_id = $1
         AND g.tenant_id = $2
         AND g.is_primary = true
       LIMIT 1`,
      [studentId, tenantId]
    );

    if (parentRes.rowCount > 0 && parentRes.rows[0].fcm_token) {
      const fcmToken = parentRes.rows[0].fcm_token;
      const notification = await enqueueNotification({
        tenantId,
        channel: 'PUSH',
        recipient: fcmToken,
        subject: 'Student Checked In',
        body: `Your child was scanned in via ${hardwareType} at ${new Date(String(timestamp)).toLocaleTimeString()}.`,
        payload: { type: 'ATTENDANCE_ALERT', studentId, tenantId },
        idempotencyKey: `attendance:${studentId}:${timestamp}:push`,
      });

      return { queuedNotificationId: notification.notificationId };
    } else {
      logger.info('worker.fcm_token_missing', 'No FCM token found for attendance scan notification', {
        tenantId,
        source: 'worker',
        entityType: 'student',
        entityId: typeof studentId === 'string' ? studentId : undefined,
      });
      return { skipped: true, reason: 'missing_fcm_token' };
    }
  },

  'send-notification': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    const notificationId = stringValue(payload, 'notificationId');
    return processNotification(notificationId, tenantId);
  },

  'dispatch-notification-outbox': async (payload) => {
    const limit = typeof payload.limit === 'number' ? payload.limit : 25;
    return processDueNotifications(limit);
  },

  'send-email': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    return enqueueNotification({
      tenantId,
      channel: 'EMAIL',
      recipient: stringValue(payload, 'to'),
      subject: optionalStringValue(payload, 'subject') || 'School notification',
      body: stringValue(payload, 'body'),
      payload,
      idempotencyKey: optionalStringValue(payload, 'idempotencyKey') || undefined,
    });
  },

  'send-sms': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    return enqueueNotification({
      tenantId,
      channel: 'SMS',
      recipient: stringValue(payload, 'phone'),
      body: stringValue(payload, 'message'),
      payload,
      idempotencyKey: optionalStringValue(payload, 'idempotencyKey') || undefined,
    });
  },

  'send-whatsapp': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    return enqueueNotification({
      tenantId,
      channel: 'WHATSAPP',
      recipient: stringValue(payload, 'phone'),
      body: optionalStringValue(payload, 'message')
        || optionalStringValue(payload, 'template')
        || 'School WhatsApp notification',
      payload,
      idempotencyKey: optionalStringValue(payload, 'idempotencyKey') || undefined,
    });
  },

  'queue-notification': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    const channel = stringValue(payload, 'channel').toUpperCase() as NotificationChannel;
    return enqueueNotification({
      tenantId,
      channel,
      recipient: stringValue(payload, 'recipient'),
      subject: optionalStringValue(payload, 'subject'),
      body: stringValue(payload, 'body'),
      payload,
      idempotencyKey: optionalStringValue(payload, 'idempotencyKey') || undefined,
    });
  },

  'route-marketing-lead': routeMarketingLead,

  'agent-incident-triage': async () => {
    throw new Error('Agent incident triage is disabled until a live agent worker is configured.');
  },
};
