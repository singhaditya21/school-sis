import { pool } from '@/lib/db';
import {
  enqueueNotification,
  processDueNotifications,
  processNotification,
  type NotificationChannel,
} from '@/lib/notifications/outbox';
import { getTenantIdFromJobPayload } from '@/lib/tenant/isolation';

type TaskHandler = (payload: Record<string, unknown>) => Promise<unknown>;

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
      console.log(`[Task Runner] No FCM token found for tenant ${tenantId} student ${studentId}.`);
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

  'agent-incident-triage': async (payload) => {
    console.log({
      event: 'agent.incident_triage.mocked',
      source: optionalStringValue(payload, 'source') || 'unknown_source',
      receivedAt: optionalStringValue(payload, 'receivedAt') || new Date().toISOString(),
    });
    return { triaged: true, mode: 'mock' };
  },
};
