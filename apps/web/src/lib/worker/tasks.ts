import { createHmac } from 'node:crypto';
import { pool } from '@/lib/db';
import { decryptFieldTolerant } from '@/lib/encryption';
import { sendWebhookRequest } from '@/lib/integrations/webhook-security';
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
    const response = await sendWebhookRequest(
      parsedUrl.toString(),
      body,
      {
        'content-type': 'application/json',
        ...(signature ? { 'x-scholarmind-signature': `sha256=${signature}` } : {}),
      },
      10_000,
    );
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
      const scannedAtIso = Number.isNaN(new Date(String(timestamp)).getTime())
        ? String(timestamp)
        : new Date(String(timestamp)).toISOString();
      const notification = await enqueueNotification({
        tenantId,
        channel: 'PUSH',
        recipient: fcmToken,
        subject: 'Student Checked In',
        body: `Your child was scanned in via ${hardwareType} at ${scannedAtIso}.`,
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

  'BI_SCHEDULED_REPORT': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    const reportId = stringValue(payload, 'reportId');
    const reportName = optionalStringValue(payload, 'name') || 'Scheduled BI Report';
    const datasetId = optionalStringValue(payload, 'datasetId') || 'general';
    const scheduleFrequency = (optionalStringValue(payload, 'scheduleFrequency') || 'NONE').toUpperCase();
    const recipientEmail = optionalStringValue(payload, 'recipientEmail');

    if (scheduleFrequency === 'NONE' || !recipientEmail) {
      return {
        skipped: true,
        reportId,
        reason: !recipientEmail ? 'missing_recipient' : 'schedule_disabled',
      };
    }

    const metricIds = Array.isArray(payload.metricIds)
      ? payload.metricIds.filter((item): item is string => typeof item === 'string')
      : [];
    const dimensionIds = Array.isArray(payload.dimensionIds)
      ? payload.dimensionIds.filter((item): item is string => typeof item === 'string')
      : [];
    const windowDate = new Date().toISOString().slice(0, 10);

    const notification = await enqueueNotification({
      tenantId,
      channel: 'EMAIL',
      recipient: recipientEmail,
      subject: `Scheduled BI Report: ${reportName}`,
      body: [
        `Your ${scheduleFrequency.toLowerCase()} BI report "${reportName}" is ready.`,
        `Dataset: ${datasetId}`,
        metricIds.length > 0 ? `Metrics: ${metricIds.join(', ')}` : null,
        dimensionIds.length > 0 ? `Dimensions: ${dimensionIds.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      payload: {
        type: 'BI_SCHEDULED_REPORT',
        tenantId,
        reportId,
        datasetId,
        metricIds,
        dimensionIds,
        scheduleFrequency,
      },
      idempotencyKey: `bi-report:${tenantId}:${reportId}:${windowDate}`,
    });

    if (
      scheduleFrequency === 'DAILY' ||
      scheduleFrequency === 'WEEKLY' ||
      scheduleFrequency === 'MONTHLY'
    ) {
      const intervalDays =
        scheduleFrequency === 'DAILY' ? 1 : scheduleFrequency === 'WEEKLY' ? 7 : 30;
      await pool.query(
        `INSERT INTO background_jobs (
            tenant_id, scope, queue, task_name, status, priority, payload,
            idempotency_key, scheduled_for, available_at, max_attempts
         )
         VALUES (
            $1,
            'TENANT',
            'default',
            'BI_SCHEDULED_REPORT',
            'SCHEDULED',
            0,
            $2::jsonb,
            $3,
            NOW() + make_interval(days => $4::int),
            NOW() + make_interval(days => $4::int),
            3
         )
         ON CONFLICT DO NOTHING`,
        [
          tenantId,
          JSON.stringify({ ...payload, tenantId }),
          `bi-report-next:${tenantId}:${reportId}:${windowDate}`,
          intervalDays,
        ],
      );
    }

    return {
      delivered: true,
      reportId,
      queuedNotificationId: notification.notificationId,
      scheduleFrequency,
    };
  },

  'workflow.follow_up_task': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    const title = stringValue(payload, 'title');
    const workflowId = optionalStringValue(payload, 'workflowId');
    const appointmentId = optionalStringValue(payload, 'appointmentId');
    const objectName = optionalStringValue(payload, 'objectName');
    const recordId = optionalStringValue(payload, 'recordId');
    const dueDate = optionalStringValue(payload, 'dueDate');

    let recipientEmail = optionalStringValue(payload, 'recipientEmail');
    if (!recipientEmail) {
      const adminRes = await pool.query<{ email: string | null; emailEnc: string | null }>(
        `SELECT email, email_enc AS "emailEnc"
           FROM users
          WHERE tenant_id = $1
            AND is_active = true
            AND role IN ('SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSION_COUNSELOR', 'STUDENT_SUCCESS_COUNSELOR')
          ORDER BY created_at ASC
          LIMIT 1`,
        [tenantId],
      );
      const adminRow = adminRes.rows[0];
      if (adminRow) {
        const decrypted = decryptFieldTolerant(adminRow.emailEnc || adminRow.email);
        recipientEmail = typeof decrypted === 'string' && decrypted.trim().length > 0 ? decrypted.trim() : null;
      }
    }

    let queuedNotificationId: string | null = null;
    if (recipientEmail) {
      const notification = await enqueueNotification({
        tenantId,
        channel: 'EMAIL',
        recipient: recipientEmail,
        subject: `Workflow Follow-Up: ${title}`,
        body: `Follow-up task "${title}"${dueDate ? ` is scheduled for ${dueDate}` : ''}${
          objectName ? ` (${objectName}${recordId ? ` #${recordId}` : ''})` : ''
        }.`,
        payload: {
          type: 'WORKFLOW_FOLLOW_UP_TASK',
          tenantId,
          workflowId,
          appointmentId,
          objectName,
          recordId,
          dueDate,
        },
        idempotencyKey: `workflow-follow-up:${tenantId}:${appointmentId || workflowId || title}:${recordId || 'record'}`,
      });
      queuedNotificationId = notification.notificationId;
    } else {
      logger.info('worker.workflow_follow_up_recorded', 'Workflow follow-up task processed without email recipient', {
        tenantId,
        source: 'worker',
        entityType: objectName || 'workflow',
        entityId: appointmentId || recordId || workflowId || undefined,
      });
    }

    return {
      processed: true,
      tenantId,
      workflowId,
      appointmentId,
      objectName,
      recordId,
      title,
      dueDate,
      queuedNotificationId,
    };
  },

  'webhook.dispatch': async (payload) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    const targetUrl = stringValue(payload, 'url');
    const workflowId = optionalStringValue(payload, 'workflowId');
    const rawMethod = (optionalStringValue(payload, 'method') || 'POST').toUpperCase();
    const method: 'POST' | 'PUT' = rawMethod === 'PUT' ? 'PUT' : 'POST';
    const serializedBody =
      typeof payload.body === 'string'
        ? payload.body
        : JSON.stringify(payload.body ?? {});

    const signingSecret = process.env.WEBHOOK_SIGNING_SECRET?.trim() || '';
    const signature =
      signingSecret.length >= 16
        ? createHmac('sha256', signingSecret).update(serializedBody).digest('hex')
        : null;

    const response = await sendWebhookRequest(
      targetUrl,
      serializedBody,
      {
        'content-type': 'application/json',
        'x-school-sis-tenant-id': tenantId,
        ...(workflowId ? { 'x-school-sis-workflow-id': workflowId } : {}),
        ...(signature ? { 'x-scholarmind-signature': `sha256=${signature}` } : {}),
      },
      10_000,
      method,
    );

    if (!response.ok) {
      throw new Error(`Webhook dispatch returned HTTP ${response.status}.`);
    }

    return {
      delivered: true,
      tenantId,
      workflowId,
      status: response.status,
    };
  },

  'agent-incident-triage': async () => {
    throw new Error('Agent incident triage is disabled until a live agent worker is configured.');
  },
};
