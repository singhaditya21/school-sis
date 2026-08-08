const notificationServiceSend = jest.fn();

jest.mock('@/lib/services/notifications', () => ({
  NotificationService: {
    sendParentAlert: (...args: unknown[]) => notificationServiceSend(...args),
  },
}));

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
  global.fetch = ORIGINAL_FETCH;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

describe('live notification provider adapters', () => {
  it('rejects WhatsApp when no live provider is selected', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WHATSAPP_PROVIDER;

    const { getWhatsAppProvider } = await import('@/lib/providers/whatsapp');
    expect(() => getWhatsAppProvider()).toThrow('WhatsApp provider is not configured.');
  });

  it('sends WhatsApp through Twilio with a signed-receipt status callback', async () => {
    process.env.WHATSAPP_PROVIDER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_WHATSAPP_FROM_NUMBER = '+14155238886';
    process.env.NOTIFICATION_TWILIO_STATUS_CALLBACK_URL = 'https://sis.example.edu/api/webhooks/notifications/twilio';
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'SM-whatsapp-1' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    const { getWhatsAppProvider } = await import('@/lib/providers/whatsapp');
    const result = await getWhatsAppProvider().send('+919876543210', 'School is closed tomorrow.');

    expect(result).toEqual({ success: true, data: { messageId: 'SM-whatsapp-1' } });
    const [, request] = (global.fetch as jest.Mock).mock.calls[0];
    const body = new URLSearchParams(request.body);
    expect(body.get('To')).toBe('whatsapp:+919876543210');
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('StatusCallback')).toBe('https://sis.example.edu/api/webhooks/notifications/twilio');
  });

  it('fails closed when a live WhatsApp receipt callback is not configured', async () => {
    process.env.WHATSAPP_PROVIDER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_WHATSAPP_FROM_NUMBER = '+14155238886';
    delete process.env.NOTIFICATION_TWILIO_STATUS_CALLBACK_URL;

    const { getWhatsAppProvider } = await import('@/lib/providers/whatsapp');
    expect(() => getWhatsAppProvider()).toThrow(/STATUS_CALLBACK_URL/);
  });

  it('routes configured push delivery through the Firebase adapter', async () => {
    process.env.PUSH_PROVIDER = 'firebase';
    process.env.FIREBASE_PROJECT_ID = 'school-sis';
    process.env.FIREBASE_CLIENT_EMAIL = 'firebase@example.edu';
    process.env.FIREBASE_PRIVATE_KEY = 'private-key';
    notificationServiceSend.mockResolvedValue({ success: true, messageId: 'projects/school-sis/messages/1' });

    const { getPushProvider } = await import('@/lib/providers/push');
    const result = await getPushProvider().send({
      token: 'device-token',
      title: 'Attendance',
      body: 'Student marked present.',
      data: { attendanceId: 'attendance-1' },
    });

    expect(result).toEqual({ success: true, data: { messageId: 'projects/school-sis/messages/1' } });
    expect(notificationServiceSend).toHaveBeenCalledWith(
      'device-token',
      'Attendance',
      'Student marked present.',
      { attendanceId: 'attendance-1' },
    );
  });

  it('includes the authenticated status callback in Twilio SMS requests', async () => {
    process.env.SMS_PROVIDER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_FROM_NUMBER = '+14155550100';
    process.env.NOTIFICATION_TWILIO_STATUS_CALLBACK_URL = 'https://sis.example.edu/api/webhooks/notifications/twilio';
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'SM-sms-1' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    const { getSmsProvider } = await import('@/lib/providers/sms');
    const result = await getSmsProvider().send('+919876543210', 'Attendance alert.');

    expect(result).toEqual({ success: true, data: { messageId: 'SM-sms-1' } });
    const [, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URLSearchParams(request.body).get('StatusCallback')).toBe(
      'https://sis.example.edu/api/webhooks/notifications/twilio',
    );
  });

  it('distinguishes a Twilio transport-unknown outcome from an explicit rejection', async () => {
    process.env.SMS_PROVIDER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_FROM_NUMBER = '+14155550100';
    process.env.NOTIFICATION_TWILIO_STATUS_CALLBACK_URL = 'https://sis.example.edu/api/webhooks/notifications/twilio';
    global.fetch = jest.fn().mockRejectedValue(new Error('socket disconnected after request write'));

    const { getSmsProvider } = await import('@/lib/providers/sms');
    await expect(getSmsProvider().send('+919876543210', 'Attendance alert.')).resolves.toMatchObject({
      success: false,
      outcome: 'UNKNOWN',
    });

    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'upstream unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));
    const { getSmsProvider: getUnknownSmsProvider } = await import('@/lib/providers/sms');
    await expect(getUnknownSmsProvider().send('+919876543210', 'Attendance alert.')).resolves.toMatchObject({
      success: false,
      outcome: 'UNKNOWN',
    });

    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'invalid recipient' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));
    const { getSmsProvider: getRejectedSmsProvider } = await import('@/lib/providers/sms');
    await expect(getRejectedSmsProvider().send('+919876543210', 'Attendance alert.')).resolves.toMatchObject({
      success: false,
      outcome: 'REJECTED',
    });
  });
});
