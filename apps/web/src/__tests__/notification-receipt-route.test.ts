const verifyTwilioReceiptSignature = jest.fn();
const parseTwilioReceipt = jest.fn();
const applyNotificationReceipt = jest.fn();

jest.mock('@/lib/notifications/receipts', () => ({
  verifyTwilioReceiptSignature: (...args: unknown[]) => verifyTwilioReceiptSignature(...args),
  parseTwilioReceipt: (...args: unknown[]) => parseTwilioReceipt(...args),
  applyNotificationReceipt: (...args: unknown[]) => applyNotificationReceipt(...args),
  verifyResendReceiptSignature: jest.fn(),
  parseResendReceipt: jest.fn(),
  verifyBridgeReceiptSignature: jest.fn(),
  parseBridgeReceipt: jest.fn(),
}));

jest.mock('@/lib/observability/logger', () => ({
  logger: { error: jest.fn() },
}));

import { POST } from '@/app/api/webhooks/notifications/[provider]/route';

const routeContext = { params: Promise.resolve({ provider: 'twilio' }) };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notification receipt webhook route', () => {
  it('rejects an invalid provider signature before parsing or database access', async () => {
    verifyTwilioReceiptSignature.mockReturnValue(false);
    const response = await POST(new Request(
      'https://sis.example.edu/api/webhooks/notifications/twilio',
      {
        method: 'POST',
        headers: { 'x-twilio-signature': 'invalid', 'content-type': 'application/x-www-form-urlencoded' },
        body: 'MessageSid=SM123&MessageStatus=delivered',
      },
    ), routeContext);

    expect(response.status).toBe(401);
    expect(parseTwilioReceipt).not.toHaveBeenCalled();
    expect(applyNotificationReceipt).not.toHaveBeenCalled();
  });

  it('accepts an authenticated receipt and reports the applied transition', async () => {
    const receipt = {
      provider: 'twilio',
      providerMessageId: 'SM123',
      status: 'DELIVERED',
      externalEventId: 'twilio:SM123:delivered',
      occurredAt: '2026-08-07T10:00:00.000Z',
    };
    verifyTwilioReceiptSignature.mockReturnValue(true);
    parseTwilioReceipt.mockReturnValue(receipt);
    applyNotificationReceipt.mockResolvedValue({
      notificationId: 'notification-1',
      tenantId: 'tenant-1',
      status: 'DELIVERED',
      duplicate: false,
      ignoredAsStale: false,
    });

    const response = await POST(new Request(
      'https://sis.example.edu/api/webhooks/notifications/twilio',
      {
        method: 'POST',
        headers: { 'x-twilio-signature': 'valid', 'content-type': 'application/x-www-form-urlencoded' },
        body: 'MessageSid=SM123&MessageStatus=delivered',
      },
    ), routeContext);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, status: 'DELIVERED', duplicate: false });
    expect(applyNotificationReceipt).toHaveBeenCalledWith(receipt);
  });
});
