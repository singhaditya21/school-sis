import {
  assertWebhookCustomHeadersAllowed,
  buildWebhookRequestHeaders,
  isPublicWebhookAddress,
  resolveWebhookTarget,
  validateWebhookTargetUrl,
  type WebhookDnsLookup,
} from '@/lib/integrations/webhook-security';

function resolvesTo(...addresses: string[]): WebhookDnsLookup {
  return jest.fn().mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
  );
}

describe('outbound webhook security', () => {
  it('requires HTTPS in production while allowing HTTP in development', async () => {
    await expect(validateWebhookTargetUrl('http://hooks.example.test/events', {
      environment: 'production',
      lookup: resolvesTo('93.184.216.34'),
    })).rejects.toThrow(/HTTPS in production/);

    await expect(validateWebhookTargetUrl('http://hooks.example.test/events', {
      environment: 'development',
      lookup: resolvesTo('93.184.216.34'),
    })).resolves.toMatchObject({ protocol: 'http:' });
  });

  it('rejects credentials and localhost hostnames', async () => {
    await expect(validateWebhookTargetUrl('https://user:secret@hooks.example.test/events', {
      environment: 'production',
      lookup: resolvesTo('93.184.216.34'),
    })).rejects.toThrow(/credentials/);
    await expect(validateWebhookTargetUrl('https://api.localhost/events', {
      environment: 'production',
      lookup: resolvesTo('93.184.216.34'),
    })).rejects.toThrow(/localhost/);
  });

  it.each([
    '127.0.0.1',
    '10.0.0.8',
    '169.254.169.254',
    '192.168.1.20',
    '192.0.2.10',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ])('classifies %s as non-public', (address) => {
    expect(isPublicWebhookAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '93.184.216.34', '2001:4860:4860::8888'])(
    'classifies %s as public',
    (address) => {
      expect(isPublicWebhookAddress(address)).toBe(true);
    },
  );

  it('rejects a hostname if any resolved address is private or reserved', async () => {
    const lookup = resolvesTo('93.184.216.34', '10.1.2.3');

    await expect(validateWebhookTargetUrl('https://hooks.example.test/events', {
      environment: 'production',
      lookup,
    })).rejects.toThrow(/resolves to a private or reserved/);
    expect(lookup).toHaveBeenCalledWith('hooks.example.test', { all: true, verbatim: true });
  });

  it('accepts and pins a hostname only when every resolved address is public', async () => {
    await expect(resolveWebhookTarget('https://hooks.example.test/events', {
      environment: 'production',
      lookup: resolvesTo('93.184.216.34', '2001:4860:4860::8888'),
    })).resolves.toMatchObject({
      url: { hostname: 'hooks.example.test', protocol: 'https:' },
      address: '93.184.216.34',
      family: 4,
    });
  });

  it('rejects protected custom headers case-insensitively', () => {
    expect(() => assertWebhookCustomHeadersAllowed({
      'x-school-sis-signature': 'attacker-value',
    })).toThrow(/reserved/);
    expect(() => assertWebhookCustomHeadersAllowed({
      'CONTENT-TYPE': 'text/plain',
    })).toThrow(/reserved/);
  });

  it('preserves safe custom headers without allowing signed headers to be overridden', () => {
    const headers = buildWebhookRequestHeaders({
      customHeaders: {
        Authorization: 'Bearer receiver-token',
        'content-TYPE': 'text/plain',
        'X-School-SIS-Event': 'forged.event',
        'idempotency-KEY': 'forged-key',
      },
      event: 'student.updated',
      eventId: 'event-123',
      signature: 'sha256=trusted',
      idempotencyKey: 'student.updated:event-123',
    });

    expect(headers).toEqual({
      Authorization: 'Bearer receiver-token',
      'Content-Type': 'application/json',
      'X-School-SIS-Event': 'student.updated',
      'X-School-SIS-Event-Id': 'event-123',
      'X-School-SIS-Signature': 'sha256=trusted',
      'Idempotency-Key': 'student.updated:event-123',
    });
  });

});
