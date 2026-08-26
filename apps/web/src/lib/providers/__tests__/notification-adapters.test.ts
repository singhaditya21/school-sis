/**
 * Contract tests for the notification channel adapters.
 *
 * The property under test throughout is the delivered/failed distinction: a channel
 * with no credentials must report itself unavailable and fail; a provider response
 * that does not evidence acceptance must fail; and nothing identifying may survive
 * into an error string that we persist on the outbox row.
 */

// firebase-admin is only reachable through this module, and the adapter under test
// is the boundary around it — not the SDK itself.
jest.mock('@/lib/services/notifications', () => ({
    NotificationService: { sendParentAlert: jest.fn() },
}));

import { NotificationService } from '@/lib/services/notifications';
import { emailAvailability, getEmailProvider, resetEmailProviderCache } from '@/lib/providers/email';
import { getPushProvider, pushAvailability, resetPushProviderCache } from '@/lib/providers/push';
import { getSmsProvider, resetSmsProviderCache, smsAvailability } from '@/lib/providers/sms';
import {
    buildTemplateMessage,
    getWhatsAppProvider,
    resetWhatsAppProviderCache,
    resolveTemplateSpec,
    whatsAppAvailability,
} from '@/lib/providers/whatsapp';
import { describeChannelReadiness } from '@/lib/notifications/channels';
import {
    maskEmail,
    maskPhone,
    normalizeToE164Digits,
    providerFetch,
    redactSensitiveText,
} from '@/lib/providers/transport';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;
const sendParentAlert = NotificationService.sendParentAlert as jest.Mock;

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function mockFetchOnce(response: Response) {
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

function lastRequestBody(fetchMock: jest.Mock): Record<string, unknown> {
    return JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
}

beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
    for (const name of [
        'EMAIL_PROVIDER', 'SMS_PROVIDER', 'WHATSAPP_PROVIDER', 'PUSH_PROVIDER',
        'ENABLE_INTEGRATION_MOCKS', 'INTEGRATIONS_MODE',
        'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'RESEND_API_KEY',
        'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'MSG91_SENDER_ID',
        'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID',
        'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_DEFAULT_TEMPLATE',
        'WHATSAPP_DEFAULT_LANGUAGE', 'WHATSAPP_ALLOW_FREEFORM',
        'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
        'NOTIFICATION_PROVIDER_TIMEOUT_MS',
    ]) {
        delete process.env[name];
    }
    resetEmailProviderCache();
    resetSmsProviderCache();
    resetWhatsAppProviderCache();
    resetPushProviderCache();
    sendParentAlert.mockReset();
    global.fetch = ORIGINAL_FETCH;
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
});

describe('unconfigured channels', () => {
    it('reports every external channel unavailable in production with no provider set', () => {
        process.env.NODE_ENV = 'production';

        for (const channel of ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] as const) {
            const readiness = describeChannelReadiness(channel);
            expect(readiness.available).toBe(false);
            expect(readiness.reason).toMatch(/No \w+_PROVIDER is set for this deployment\./);
        }
        // In-app delivery is the row itself, so it is always available.
        expect(describeChannelReadiness('IN_APP').available).toBe(true);
    });

    it('fails the send instead of throwing, and never reports success', async () => {
        process.env.NODE_ENV = 'production';

        const email = await getEmailProvider().send({ to: 'a@b.test', subject: 's', html: '<p>x</p>' });
        const sms = await getSmsProvider().send('+919999999999', 'hi');
        const whatsapp = await getWhatsAppProvider().send({ to: '+919999999999', body: 'hi' });
        const push = await getPushProvider().send({ deviceToken: 'tok', title: 't', body: 'b' });

        for (const result of [email, sms, whatsapp, push]) {
            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeTruthy();
        }
    });

    it('names the missing WhatsApp credentials when the provider is selected but unconfigured', () => {
        process.env.NODE_ENV = 'production';
        process.env.WHATSAPP_PROVIDER = 'meta_cloud';

        const state = whatsAppAvailability();
        expect(state.available).toBe(false);
        expect(state.missing).toEqual(['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN']);
    });

    it('treats a half-configured provider as unavailable', () => {
        process.env.NODE_ENV = 'production';
        process.env.WHATSAPP_PROVIDER = 'meta_cloud';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';

        expect(whatsAppAvailability().missing).toEqual(['WHATSAPP_ACCESS_TOKEN']);

        process.env.SMS_PROVIDER = 'msg91';
        process.env.MSG91_AUTH_KEY = 'key';
        expect(smsAvailability().available).toBe(false);
        expect(smsAvailability().missing).toEqual(['MSG91_TEMPLATE_ID']);

        process.env.EMAIL_PROVIDER = 'resend';
        process.env.RESEND_API_KEY = 'key';
        expect(emailAvailability().missing).toEqual(['EMAIL_FROM']);

        process.env.PUSH_PROVIDER = 'firebase';
        process.env.FIREBASE_PROJECT_ID = 'p';
        expect(pushAvailability().missing).toEqual(['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
    });
});

describe('WhatsApp Cloud API adapter', () => {
    function configure() {
        process.env.WHATSAPP_PROVIDER = 'meta_cloud';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '109876543210';
        process.env.WHATSAPP_ACCESS_TOKEN = 'system-user-token';
        process.env.WHATSAPP_DEFAULT_TEMPLATE = 'fee_reminder';
        resetWhatsAppProviderCache();
    }

    it('posts an approved template message and returns the wamid', async () => {
        configure();
        const fetchMock = mockFetchOnce(jsonResponse({
            messaging_product: 'whatsapp',
            contacts: [{ input: '919876543210', wa_id: '919876543210' }],
            messages: [{ id: 'wamid.TEST', message_status: 'accepted' }],
        }));

        const result = await getWhatsAppProvider().send({
            to: '9876543210',
            body: 'Term 2 fees of Rs 12,500 are due on 30 Sep.',
        });

        expect(result.success).toBe(true);
        expect(result.data?.messageId).toBe('wamid.TEST');
        // Only the statuses webhook may promote a WhatsApp message to DELIVERED.
        expect(result.data?.deliveryState).toBe('ACCEPTED');

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://graph.facebook.com/v21.0/109876543210/messages');
        expect((init as RequestInit).signal).toBeDefined();

        const body = lastRequestBody(fetchMock);
        expect(body.type).toBe('template');
        expect(body.to).toBe('919876543210');
        expect(body.template).toEqual({
            name: 'fee_reminder',
            language: { code: 'en' },
            components: [{
                type: 'body',
                parameters: [{ type: 'text', text: 'Term 2 fees of Rs 12,500 are due on 30 Sep.' }],
            }],
        });
    });

    it('refuses to send when no approved template can be resolved', async () => {
        configure();
        delete process.env.WHATSAPP_DEFAULT_TEMPLATE;
        const fetchMock = mockFetchOnce(jsonResponse({}));

        const result = await getWhatsAppProvider().send({ to: '9876543210', body: 'hello' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/approved template/i);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('treats a Meta error envelope as a failure and strips the echoed phone number', async () => {
        configure();
        mockFetchOnce(jsonResponse({
            error: {
                message: 'Recipient phone number not in allowed list: +91 98765 43210',
                type: 'OAuthException',
                code: 131030,
            },
        }, 400));

        const result = await getWhatsAppProvider().send({ to: '9876543210', body: 'hello' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('131030');
        expect(result.error).not.toContain('98765');
        expect(result.error).toContain('[redacted-number]');
    });

    it('fails a 200 that carries no message id, rather than claiming a send', async () => {
        configure();
        mockFetchOnce(jsonResponse({ messaging_product: 'whatsapp', messages: [] }));

        const result = await getWhatsAppProvider().send({ to: '9876543210', body: 'hello' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/without a message id/i);
    });

    it('honours a per-message template and its variables from the notification payload', () => {
        const spec = resolveTemplateSpec('ignored fallback', {
            whatsapp: {
                templateName: 'attendance_absent',
                languageCode: 'en_US',
                bodyParameters: ['Aarav', 'Monday, 8 Sep'],
            },
        });

        expect(spec).toEqual({
            name: 'attendance_absent',
            languageCode: 'en_US',
            headerParameters: [],
            bodyParameters: ['Aarav', 'Monday, 8 Sep'],
        });
        expect(buildTemplateMessage('919876543210', spec!).type).toBe('template');
    });

    it('flattens whitespace that Meta rejects inside template variables', () => {
        const spec = resolveTemplateSpec('Dear parent,\n\n   fees    are due.', {});
        expect(spec).toBeNull();

        const withTemplate = resolveTemplateSpec('Dear parent,\n\n   fees    are due.', {
            whatsapp: { templateName: 'fee_reminder' },
        });
        expect(withTemplate?.bodyParameters).toEqual(['Dear parent, fees are due.']);
    });

    it('rejects free-form text unless the deployment opts in', async () => {
        configure();
        const fetchMock = mockFetchOnce(jsonResponse({ messages: [{ id: 'wamid.TXT' }] }));

        await getWhatsAppProvider().send({
            to: '9876543210',
            body: 'hello',
            payload: { whatsapp: { messageType: 'text' } },
        });
        // Falls back to the template shape rather than sending free-form.
        expect(lastRequestBody(fetchMock).type).toBe('template');

        process.env.WHATSAPP_ALLOW_FREEFORM = 'true';
        const allowed = mockFetchOnce(jsonResponse({ messages: [{ id: 'wamid.TXT' }] }));
        await getWhatsAppProvider().send({
            to: '9876543210',
            body: 'hello',
            payload: { whatsapp: { messageType: 'text' } },
        });
        expect(lastRequestBody(allowed).type).toBe('text');
    });
});

describe('SMS adapters', () => {
    it('fails an MSG91 error envelope returned with HTTP 200', async () => {
        process.env.SMS_PROVIDER = 'msg91';
        process.env.MSG91_AUTH_KEY = 'key';
        process.env.MSG91_TEMPLATE_ID = 'flow-id';
        resetSmsProviderCache();
        mockFetchOnce(jsonResponse({ message: 'Invalid template id', type: 'error' }));

        const result = await getSmsProvider().send('9876543210', 'Fees due');

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/type=error/);
    });

    it('accepts an MSG91 success envelope and reports the request id', async () => {
        process.env.SMS_PROVIDER = 'msg91';
        process.env.MSG91_AUTH_KEY = 'key';
        process.env.MSG91_TEMPLATE_ID = 'flow-id';
        resetSmsProviderCache();
        const fetchMock = mockFetchOnce(jsonResponse({ message: 'req-123', type: 'success' }));

        const result = await getSmsProvider().send('9876543210', 'Fees due');

        expect(result.success).toBe(true);
        expect(result.data?.messageId).toBe('req-123');
        expect(lastRequestBody(fetchMock)).toMatchObject({
            template_id: 'flow-id',
            recipients: [{ mobiles: '919876543210', MESSAGE: 'Fees due' }],
        });
    });

    it('fails a Twilio 201 whose status is already terminal', async () => {
        process.env.SMS_PROVIDER = 'twilio';
        process.env.TWILIO_ACCOUNT_SID = 'AC123';
        process.env.TWILIO_AUTH_TOKEN = 'token';
        process.env.TWILIO_FROM_NUMBER = '+15005550006';
        resetSmsProviderCache();
        mockFetchOnce(jsonResponse({ sid: 'SM1', status: 'failed', error_code: 21610 }, 201));

        const result = await getSmsProvider().send('+919876543210', 'Fees due');

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/status=failed/);
    });

    it('maps a Twilio delivered status to DELIVERED, not merely accepted', async () => {
        process.env.SMS_PROVIDER = 'twilio';
        process.env.TWILIO_ACCOUNT_SID = 'AC123';
        process.env.TWILIO_AUTH_TOKEN = 'token';
        process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG123';
        resetSmsProviderCache();
        mockFetchOnce(jsonResponse({ sid: 'SM2', status: 'delivered' }, 201));

        const result = await getSmsProvider().send('+919876543210', 'Fees due');

        expect(result.success).toBe(true);
        expect(result.data?.deliveryState).toBe('DELIVERED');
    });
});

describe('push adapter', () => {
    it('fails when Firebase returns no message name', async () => {
        process.env.PUSH_PROVIDER = 'firebase';
        process.env.FIREBASE_PROJECT_ID = 'p';
        process.env.FIREBASE_CLIENT_EMAIL = 'sa@p.iam.gserviceaccount.com';
        process.env.FIREBASE_PRIVATE_KEY = 'key';
        resetPushProviderCache();
        sendParentAlert.mockResolvedValue({ success: true, messageId: '' });

        const result = await getPushProvider().send({ deviceToken: 'device', title: 't', body: 'b' });

        expect(result.success).toBe(false);
    });

    it('coerces the data payload into the string map FCM requires', async () => {
        process.env.PUSH_PROVIDER = 'firebase';
        process.env.FIREBASE_PROJECT_ID = 'p';
        process.env.FIREBASE_CLIENT_EMAIL = 'sa@p.iam.gserviceaccount.com';
        process.env.FIREBASE_PRIVATE_KEY = 'key';
        resetPushProviderCache();
        sendParentAlert.mockResolvedValue({ success: true, messageId: 'projects/p/messages/1' });

        const result = await getPushProvider().send({
            deviceToken: 'device',
            title: 't',
            body: 'b',
            data: { messageId: 'abc', amount: 12500, meta: { a: 1 }, skip: null },
        });

        expect(result.success).toBe(true);
        expect(sendParentAlert).toHaveBeenCalledWith('device', 't', 'b', {
            messageId: 'abc',
            amount: '12500',
            meta: '{"a":1}',
        });
    });

    it('records a Firebase throw as a failure', async () => {
        process.env.PUSH_PROVIDER = 'firebase';
        process.env.FIREBASE_PROJECT_ID = 'p';
        process.env.FIREBASE_CLIENT_EMAIL = 'sa@p.iam.gserviceaccount.com';
        process.env.FIREBASE_PRIVATE_KEY = 'key';
        resetPushProviderCache();
        sendParentAlert.mockRejectedValue(new Error('messaging/registration-token-not-registered'));

        const result = await getPushProvider().send({ deviceToken: 'device', title: 't', body: 'b' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('registration-token-not-registered');
    });
});

describe('transport', () => {
    it('aborts a provider that does not answer within the timeout', async () => {
        global.fetch = jest.fn((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
                reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
            });
        })) as unknown as typeof fetch;

        await expect(providerFetch('https://example.test', { method: 'POST' }, 1_000))
            .rejects.toThrow(/did not respond within 1000ms/);
    });

    it('strips numbers, addresses and tokens from anything destined for an error column', () => {
        const redacted = redactSensitiveText(
            'Failed for +91 98765 43210 / parent@example.com with Bearer abcdefghijklmnopqrstuvwxyz012345',
        );

        expect(redacted).not.toContain('98765');
        expect(redacted).not.toContain('parent@example.com');
        expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
    });

    it('masks identifiers down to a reconcilable tail', () => {
        expect(maskPhone('+91 98765 43210')).toBe('***3210');
        expect(maskEmail('parent@example.com')).toBe('p***@***.com');
    });

    it('promotes a bare Indian national number to E.164 digits', () => {
        expect(normalizeToE164Digits('9876543210')).toEqual({ digits: '919876543210' });
        expect(normalizeToE164Digits('09876543210')).toEqual({ digits: '919876543210' });
        expect(normalizeToE164Digits('+1 415 555 0123')).toEqual({ digits: '14155550123' });
        expect(normalizeToE164Digits('12345')).toHaveProperty('error');
    });
});
