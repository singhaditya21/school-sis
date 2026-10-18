import { verifyTurnstileToken } from '@/lib/marketing/turnstile';

function fetchReturning(payload: unknown, ok = true) {
  return jest.fn(async () => ({ ok, json: async () => payload })) as unknown as typeof fetch;
}

const SECRET = 'turnstile-secret';

describe('verifyTurnstileToken', () => {
  it('is inert (allows) when no secret is configured', async () => {
    const fetchImpl = fetchReturning({ success: true });
    expect(await verifyTurnstileToken('tok', { fetchImpl })).toEqual({ ok: true, reason: 'skipped' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a missing token once configured', async () => {
    expect(await verifyTurnstileToken('', { secret: SECRET })).toEqual({ ok: false, reason: 'missing_token' });
    expect(await verifyTurnstileToken(null, { secret: SECRET })).toEqual({ ok: false, reason: 'missing_token' });
  });

  it('accepts a token Cloudflare verifies', async () => {
    expect(await verifyTurnstileToken('good', { secret: SECRET, fetchImpl: fetchReturning({ success: true }) })).toEqual({
      ok: true,
    });
  });

  it('rejects a token Cloudflare says is invalid', async () => {
    expect(
      await verifyTurnstileToken('bad', { secret: SECRET, fetchImpl: fetchReturning({ success: false }) }),
    ).toEqual({ ok: false, reason: 'rejected' });
  });

  it('fails OPEN on a Cloudflare outage (network or non-200), so real leads survive', async () => {
    const throwing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstileToken('good', { secret: SECRET, fetchImpl: throwing })).toEqual({ ok: true, reason: 'error' });
    expect(await verifyTurnstileToken('good', { secret: SECRET, fetchImpl: fetchReturning({}, false) })).toEqual({
      ok: true,
      reason: 'error',
    });
  });

  it('sends the token and remote ip to Cloudflare', async () => {
    const fetchImpl = fetchReturning({ success: true });
    await verifyTurnstileToken('the-token', { secret: SECRET, remoteIp: '203.0.113.7', fetchImpl });
    const body = (fetchImpl as jest.Mock).mock.calls[0][1].body as URLSearchParams;
    expect(body.get('response')).toBe('the-token');
    expect(body.get('remoteip')).toBe('203.0.113.7');
    expect(body.get('secret')).toBe(SECRET);
  });
});
