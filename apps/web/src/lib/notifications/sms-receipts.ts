/**
 * SMS delivery-receipt verification + parsing (issue #25).
 *
 * The inbound half for SMS, mirroring ./receipts.ts (WhatsApp). The tenant-routing
 * and recording is shared: recordDeliveryReceipt() in ./outbox is provider-agnostic
 * and matches on (provider, provider_message_id), and an SMS send already stores the
 * provider's own id there (Twilio MessageSid, MSG91 request_id).
 *
 * Two providers, selected by SMS_PROVIDER (notificationProviderForChannel('SMS')):
 *   • Twilio — a signed status callback. HMAC-SHA1 over the exact callback URL plus
 *     the alphabetically-sorted POST params, base64, compared to X-Twilio-Signature.
 *     Fully specified and verifiable; this is the robust path.
 *   • MSG91 — MSG91 delivery reports carry no HMAC, so the callback is guarded by a
 *     shared secret (a header or query param the webhook URL is configured with).
 *     The report SHAPE is provider-version-specific and MUST be confirmed against a
 *     real MSG91 payload before go-live — the parser here is best-effort and
 *     fail-safe (an unrecognised body yields no receipts rather than a wrong one).
 */
import crypto from 'node:crypto';
import type { DeliveryReceipt } from './receipts';

export type { DeliveryReceipt } from './receipts';

// ─── Twilio ──────────────────────────────────────────────────────────────────

/**
 * Verify Twilio's `X-Twilio-Signature`. Twilio signs `url + concat(sorted k+v)`
 * with HMAC-SHA1(authToken), base64. `url` must be the exact public callback URL
 * Twilio posted to; behind a proxy set TWILIO_STATUS_CALLBACK_URL to pin it.
 * Fail-closed on a missing token, header, or mismatch.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null | undefined,
  authToken: string | undefined,
): boolean {
  if (!authToken || !signatureHeader) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');

  const provided = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) return false;
  return crypto.timingSafeEqual(provided, computed);
}

/** Twilio statuses that mean the message will not arrive. */
const TWILIO_FAILED = new Set(['failed', 'undelivered', 'canceled']);

/**
 * Map a Twilio status callback to a terminal receipt. `delivered` → DELIVERED;
 * failed/undelivered/canceled → FAILED; the intermediate states
 * (accepted/queued/sending/sent) are not terminal and are ignored.
 */
export function parseTwilioReceipt(params: Record<string, string>): DeliveryReceipt | null {
  const sid = params.MessageSid || params.SmsSid;
  if (!sid) return null;

  const status = String(params.MessageStatus || params.SmsStatus || '').toLowerCase();
  if (status === 'delivered') {
    return { providerMessageId: sid, status: 'DELIVERED' };
  }
  if (TWILIO_FAILED.has(status)) {
    const code = params.ErrorCode ? ` (error ${params.ErrorCode})` : '';
    return { providerMessageId: sid, status: 'FAILED', error: `Twilio reported ${status}${code}` };
  }
  return null;
}

// ─── MSG91 ───────────────────────────────────────────────────────────────────

/** Constant-time shared-secret check for the MSG91 callback (it carries no HMAC). */
export function verifyMsg91Secret(
  provided: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type Msg91Report = {
  requestId?: unknown;
  request_id?: unknown;
  status?: unknown;
  description?: unknown;
  report?: unknown;
};

// Textual statuses / numeric DLR codes MSG91 uses. Codes vary by API version, so
// this is intentionally conservative: only clearly-terminal values map, everything
// else is skipped. CONFIRM against a real MSG91 delivery payload before go-live.
const MSG91_DELIVERED = new Set(['delivered', 'dlvrd', '1']);
const MSG91_FAILED = new Set(['failed', 'undelivered', 'rejected', 'expired', 'blocked', '2', '3', '5', '6', '7', '8', '9']);

/**
 * Best-effort parse of an MSG91 delivery-report body into terminal receipts.
 * Accepts a single report, `{ data: [...] }`, or a bare array. Fail-safe: an
 * unrecognised shape or status yields no receipt rather than a wrong one.
 */
export function parseMsg91Receipts(body: unknown): DeliveryReceipt[] {
  const reports: Msg91Report[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: Msg91Report[] })?.data)
      ? ((body as { data: Msg91Report[] }).data)
      : body && typeof body === 'object'
        ? [body as Msg91Report]
        : [];

  const receipts: DeliveryReceipt[] = [];
  for (const report of reports) {
    const id = readString(report?.requestId) ?? readString(report?.request_id);
    if (!id) continue;

    const status = (readString(report?.status) ?? readString(report?.report) ?? '').toLowerCase();
    if (MSG91_DELIVERED.has(status)) {
      receipts.push({ providerMessageId: id, status: 'DELIVERED' });
    } else if (MSG91_FAILED.has(status)) {
      receipts.push({
        providerMessageId: id,
        status: 'FAILED',
        error: readString(report?.description) ?? `MSG91 reported ${status}`,
      });
    }
  }
  return receipts;
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}
