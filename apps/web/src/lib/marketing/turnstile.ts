/**
 * Cloudflare Turnstile verification for the public lead form (issue #31).
 *
 * This is the CAPTCHA layer that sits beside the vendor-free screening in
 * ./lead-screening. It is isolated behind one function so swapping to another
 * provider later is a single-file change.
 *
 * Ships inert: with TURNSTILE_SECRET_KEY unset the check is skipped, so the form
 * keeps working until keys are provisioned. Once configured it fails CLOSED on a
 * missing or rejected token, but fails OPEN on a Cloudflare outage (network/HTTP
 * error) — a verification-service blip must not silently swallow real leads, and
 * rate-limiting + honeypot + dwell-time still apply underneath.
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult = {
  ok: boolean;
  reason?: 'skipped' | 'missing_token' | 'rejected' | 'error';
};

export async function verifyTurnstileToken(
  token: string | null | undefined,
  opts: { secret?: string; remoteIp?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<TurnstileResult> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, reason: 'skipped' };

  const response = typeof token === 'string' ? token.trim() : '';
  if (!response) return { ok: false, reason: 'missing_token' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);
  try {
    const body = new URLSearchParams({ secret, response });
    if (opts.remoteIp) body.set('remoteip', opts.remoteIp);

    const res = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body, signal: controller.signal });
    if (!res.ok) return { ok: true, reason: 'error' };

    const data = (await res.json().catch(() => null)) as { success?: unknown } | null;
    return data && data.success === true ? { ok: true } : { ok: false, reason: 'rejected' };
  } catch {
    // Network error / timeout — fail open (the caller logs it).
    return { ok: true, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
