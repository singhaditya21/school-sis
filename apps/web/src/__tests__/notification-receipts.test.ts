import crypto from 'crypto';

const poolQuery = jest.fn();
const clientQuery = jest.fn();
const clientRelease = jest.fn();
const runWithRlsBypass = jest.fn(async (_reason: unknown, callback: () => Promise<unknown>) => callback());
const runWithTenantContext = jest.fn(async (_tenantId: string, callback: () => Promise<unknown>) => callback());

jest.mock('@/lib/db', () => ({
  pool: {
    query: (...args: unknown[]) => poolQuery(...args),
    connect: jest.fn(async () => ({ query: clientQuery, release: clientRelease })),
  },
  RLS_BYPASS_JUSTIFICATIONS: { PROVIDER_NOTIFICATION_LOOKUP: { id: 'notifications.provider-receipt' } },
  runWithRlsBypass: (...args: unknown[]) => runWithRlsBypass(...args as [unknown, () => Promise<unknown>]),
  runWithTenantContext: (...args: unknown[]) => runWithTenantContext(...args as [string, () => Promise<unknown>]),
}));

import {
  applyNotificationReceipt,
  parseBridgeReceipt,
  parseResendReceipt,
  parseTwilioReceipt,
  verifyBridgeReceiptSignature,
  verifyResendReceiptSignature,
  verifyTwilioReceiptSignature,
} from '@/lib/notifications/receipts';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const NOTIFICATION_ID = '9ea1a382-7f2d-4e2f-b06b-9c7a96b86775';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authenticated notification receipts', () => {
  it('verifies and parses Twilio delivery callbacks', () => {
    const callbackUrl = 'https://sis.example.edu/api/webhooks/notifications/twilio';
    const authToken = 'twilio-auth-token';
    const rawBody = 'MessageSid=SM123&MessageStatus=delivered&RawDlrDoneDate=2608071015';
    const params = [...new URLSearchParams(rawBody).entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const signature = crypto.createHmac('sha1', authToken)
      .update(callbackUrl + params.map(([key, value]) => `${key}${value}`).join(''))
      .digest('base64');

    expect(verifyTwilioReceiptSignature(rawBody, signature, callbackUrl, authToken)).toBe(true);
    expect(verifyTwilioReceiptSignature(rawBody, 'invalid', callbackUrl, authToken)).toBe(false);
    expect(parseTwilioReceipt(rawBody)).toMatchObject({
      provider: 'twilio',
      providerMessageId: 'SM123',
      status: 'DELIVERED',
    });
  });

  it('verifies Resend Svix signatures and maps suppression events', () => {
    const now = Date.parse('2026-08-07T10:00:00.000Z');
    const timestamp = String(Math.floor(now / 1000));
    const id = 'msg_resend_1';
    const rawBody = JSON.stringify({
      type: 'email.suppressed',
      created_at: '2026-08-07T09:59:59.000Z',
      data: { email_id: 'email-1' },
    });
    const secretBytes = Buffer.from('0123456789abcdef0123456789abcdef');
    const secret = `whsec_${secretBytes.toString('base64')}`;
    const signature = `v1,${crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;

    expect(verifyResendReceiptSignature(rawBody, { id, timestamp, signature }, secret, now)).toBe(true);
    expect(verifyResendReceiptSignature(rawBody, { id, timestamp: '1', signature }, secret, now)).toBe(false);
    expect(parseResendReceipt(rawBody, id)).toMatchObject({
      provider: 'resend',
      providerMessageId: 'email-1',
      status: 'SUPPRESSED',
      externalEventId: id,
    });
  });

  it('verifies normalized bridge receipts and rejects unsupported statuses', () => {
    const secret = 'notification-receipt-secret';
    const rawBody = JSON.stringify({
      providerMessageId: 'firebase-message-1',
      status: 'DELIVERED',
      eventId: 'firebase-event-1',
      occurredAt: '2026-08-07T10:00:00.000Z',
    });
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    expect(verifyBridgeReceiptSignature(rawBody, signature, secret)).toBe(true);
    expect(parseBridgeReceipt(rawBody, 'firebase')).toMatchObject({
      provider: 'firebase',
      status: 'DELIVERED',
    });
    expect(() => parseBridgeReceipt(JSON.stringify({
      providerMessageId: 'id',
      status: 'UNKNOWN',
      eventId: 'event',
    }), 'msg91')).toThrow(/Unsupported receipt status/);
  });

  it('resolves a verified provider id with reviewed bypass, then mutates only under its tenant context', async () => {
    poolQuery.mockResolvedValue({ rows: [{ tenantId: TENANT_ID, notificationId: NOTIFICATION_ID }] });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM notification_outbox') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: NOTIFICATION_ID,
          tenantId: TENANT_ID,
          jobId: null,
          status: 'SENT',
          payload: { messageId: 'linked-message-1' },
        }] };
      }
      if (sql.includes("metadata ->> 'externalEventId'")) return { rows: [], rowCount: 0 };
      if (sql.includes("metadata ->> 'receiptOccurredAt'")) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });

    const result = await applyNotificationReceipt({
      provider: 'twilio',
      providerMessageId: 'SM123',
      status: 'DELIVERED',
      externalEventId: 'twilio:SM123:delivered',
      occurredAt: '2026-08-07T10:00:00.000Z',
    });

    expect(result).toMatchObject({ status: 'DELIVERED', duplicate: false, ignoredAsStale: false });
    expect(runWithRlsBypass).toHaveBeenCalledTimes(1);
    expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE notification_outbox'))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO notification_delivery_events'))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE messages'))).toBe(true);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a replayed provider event while holding the tenant row lock', async () => {
    poolQuery.mockResolvedValue({ rows: [{ tenantId: TENANT_ID, notificationId: NOTIFICATION_ID }] });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM notification_outbox') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: NOTIFICATION_ID,
          tenantId: TENANT_ID,
          jobId: null,
          status: 'DELIVERED',
          payload: {},
        }] };
      }
      if (sql.includes("metadata ->> 'externalEventId'")) return { rows: [{ '?column?': 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await applyNotificationReceipt({
      provider: 'resend',
      providerMessageId: 'email-1',
      status: 'DELIVERED',
      externalEventId: 'msg_resend_1',
      occurredAt: '2026-08-07T10:00:00.000Z',
    });

    expect(result).toMatchObject({ status: 'DELIVERED', duplicate: true });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE notification_outbox'))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO notification_delivery_events'))).toBe(false);
  });

  it('records but does not apply an older or regressive SENT receipt', async () => {
    poolQuery.mockResolvedValue({ rows: [{ tenantId: TENANT_ID, notificationId: NOTIFICATION_ID }] });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM notification_outbox') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: NOTIFICATION_ID,
          tenantId: TENANT_ID,
          jobId: null,
          status: 'DELIVERED',
          payload: {},
        }] };
      }
      if (sql.includes("metadata ->> 'externalEventId'")) return { rows: [], rowCount: 0 };
      if (sql.includes("metadata ->> 'receiptOccurredAt'")) {
        return { rows: [{ occurredAt: '2026-08-07T10:05:00.000Z' }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await applyNotificationReceipt({
      provider: 'resend',
      providerMessageId: 'email-1',
      status: 'SENT',
      externalEventId: 'msg_resend_older',
      occurredAt: '2026-08-07T10:00:00.000Z',
    });

    expect(result).toMatchObject({ status: 'DELIVERED', duplicate: false, ignoredAsStale: true });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE notification_outbox'))).toBe(false);
    const eventInsert = clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO notification_delivery_events'));
    expect(eventInsert).toBeDefined();
    expect(String(eventInsert?.[1]?.[7])).toContain('"ignoredAsStale":true');
  });

  it('orders receipts by provider occurrence time across multiple stale arrivals', async () => {
    poolQuery.mockResolvedValue({ rows: [{ tenantId: TENANT_ID, notificationId: NOTIFICATION_ID }] });
    let outboxStatus = 'SENT';
    const events: Array<{ externalEventId: string; occurredAt: string }> = [];
    clientQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM notification_outbox') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: NOTIFICATION_ID,
          tenantId: TENANT_ID,
          jobId: null,
          status: outboxStatus,
          payload: {},
        }] };
      }
      if (sql.includes("metadata ->> 'externalEventId'")) {
        const duplicate = events.some((event) => event.externalEventId === values?.[2]);
        return { rows: duplicate ? [{ '?column?': 1 }] : [], rowCount: duplicate ? 1 : 0 };
      }
      if (sql.includes("MAX(metadata ->> 'receiptOccurredAt')")) {
        const occurredAt = events.map((event) => event.occurredAt).sort().at(-1) || null;
        return { rows: [{ occurredAt }] };
      }
      if (sql.includes('UPDATE notification_outbox')) {
        outboxStatus = String(values?.[0]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO notification_delivery_events')) {
        const metadata = JSON.parse(String(values?.[7])) as {
          externalEventId: string;
          receiptOccurredAt: string;
        };
        events.push({
          externalEventId: metadata.externalEventId,
          occurredAt: metadata.receiptOccurredAt,
        });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const base = { provider: 'resend' as const, providerMessageId: 'email-1' };
    await expect(applyNotificationReceipt({
      ...base,
      status: 'DELIVERED',
      externalEventId: 'delivered-1010',
      occurredAt: '2026-08-07T10:10:00.000Z',
    })).resolves.toMatchObject({ status: 'DELIVERED', ignoredAsStale: false });
    await expect(applyNotificationReceipt({
      ...base,
      status: 'SENT',
      externalEventId: 'sent-1000',
      occurredAt: '2026-08-07T10:00:00.000Z',
    })).resolves.toMatchObject({ status: 'DELIVERED', ignoredAsStale: true });
    await expect(applyNotificationReceipt({
      ...base,
      status: 'FAILED',
      externalEventId: 'failed-1005',
      occurredAt: '2026-08-07T10:05:00.000Z',
    })).resolves.toMatchObject({ status: 'DELIVERED', ignoredAsStale: true });

    expect(outboxStatus).toBe('DELIVERED');
    expect(events).toHaveLength(3);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('ORDER BY created_at DESC'))).toBe(false);
  });
});
