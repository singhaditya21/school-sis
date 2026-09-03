import crypto from 'node:crypto';
import {
  verifyTwilioSignature,
  parseTwilioReceipt,
  verifyMsg91Secret,
  parseMsg91Receipts,
} from '@/lib/notifications/sms-receipts';

const URL_ = 'https://sis.example.edu/api/webhooks/sms';
const TOKEN = 'twilio-auth-token';

function twilioSign(url: string, params: Record<string, string>, token: string): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
}

describe('verifyTwilioSignature', () => {
  const params = { MessageSid: 'SM123', MessageStatus: 'delivered', To: '+15551234567' };

  it('accepts a correct signature over the url + sorted params', () => {
    expect(verifyTwilioSignature(URL_, params, twilioSign(URL_, params, TOKEN), TOKEN)).toBe(true);
  });

  it('rejects a signature made with the wrong token', () => {
    expect(verifyTwilioSignature(URL_, params, twilioSign(URL_, params, 'other'), TOKEN)).toBe(false);
  });

  it('rejects when a param was tampered with after signing', () => {
    const sig = twilioSign(URL_, params, TOKEN);
    expect(verifyTwilioSignature(URL_, { ...params, MessageStatus: 'failed' }, sig, TOKEN)).toBe(false);
  });

  it('fails closed on an unset token or missing header', () => {
    expect(verifyTwilioSignature(URL_, params, twilioSign(URL_, params, TOKEN), undefined)).toBe(false);
    expect(verifyTwilioSignature(URL_, params, null, TOKEN)).toBe(false);
  });
});

describe('parseTwilioReceipt', () => {
  it('maps delivered to DELIVERED', () => {
    expect(parseTwilioReceipt({ MessageSid: 'SM1', MessageStatus: 'delivered' })).toEqual({
      providerMessageId: 'SM1',
      status: 'DELIVERED',
    });
  });

  it('maps failed/undelivered/canceled to FAILED with the error code', () => {
    expect(parseTwilioReceipt({ MessageSid: 'SM2', MessageStatus: 'undelivered', ErrorCode: '30008' })).toEqual({
      providerMessageId: 'SM2',
      status: 'FAILED',
      error: 'Twilio reported undelivered (error 30008)',
    });
    expect(parseTwilioReceipt({ MessageSid: 'SM3', MessageStatus: 'failed' })?.status).toBe('FAILED');
  });

  it('ignores non-terminal statuses and a missing sid', () => {
    expect(parseTwilioReceipt({ MessageSid: 'SM4', MessageStatus: 'sent' })).toBeNull();
    expect(parseTwilioReceipt({ MessageSid: 'SM5', MessageStatus: 'queued' })).toBeNull();
    expect(parseTwilioReceipt({ MessageStatus: 'delivered' })).toBeNull();
  });
});

describe('verifyMsg91Secret', () => {
  it('accepts a matching secret and fails closed otherwise', () => {
    expect(verifyMsg91Secret('s3cret', 's3cret')).toBe(true);
    expect(verifyMsg91Secret('wrong', 's3cret')).toBe(false);
    expect(verifyMsg91Secret('s3cret', undefined)).toBe(false);
    expect(verifyMsg91Secret(null, 's3cret')).toBe(false);
  });
});

describe('parseMsg91Receipts', () => {
  it('reads a bare array, a { data: [] } envelope, and a single report', () => {
    const one = { requestId: 'req-1', status: 'delivered' };
    expect(parseMsg91Receipts([one])).toEqual([{ providerMessageId: 'req-1', status: 'DELIVERED' }]);
    expect(parseMsg91Receipts({ data: [one] })).toEqual([{ providerMessageId: 'req-1', status: 'DELIVERED' }]);
    expect(parseMsg91Receipts(one)).toEqual([{ providerMessageId: 'req-1', status: 'DELIVERED' }]);
  });

  it('maps a failed report and carries its description', () => {
    expect(parseMsg91Receipts([{ request_id: 'req-2', status: 'failed', description: 'DND' }])).toEqual([
      { providerMessageId: 'req-2', status: 'FAILED', error: 'DND' },
    ]);
  });

  it('is fail-safe: unknown status, missing id, and non-object bodies yield nothing', () => {
    expect(parseMsg91Receipts([{ requestId: 'req-3', status: 'queued' }])).toEqual([]);
    expect(parseMsg91Receipts([{ status: 'delivered' }])).toEqual([]);
    expect(parseMsg91Receipts(null)).toEqual([]);
    expect(parseMsg91Receipts('nope')).toEqual([]);
  });
});
