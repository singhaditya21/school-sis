/**
 * Provider delivery-receipt ingestion — the inbound half of the notification
 * outbox. A send records ACCEPTED ("the provider took the message"); only the
 * provider's own status callback can move a message to DELIVERED or FAILED. This
 * module verifies and parses those callbacks; {@link recordDeliveryReceipt} in
 * ./outbox applies them to the right tenant's rows.
 *
 * Currently WhatsApp (Meta Cloud API) statuses. The signature and parse helpers
 * are kept pure and dependency-free so the route stays a thin, testable shell.
 */
import crypto from 'node:crypto';

/**
 * Verify Meta's `X-Hub-Signature-256` header, which is
 * `sha256=<hex hmac-sha256(rawBody, appSecret)>`.
 *
 * Fail-closed: a missing secret or header, a malformed header, or any mismatch
 * returns false. The comparison is constant-time over equal-length buffers.
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !signatureHeader) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  const provided = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so gate on length first.
  if (provided.length !== computed.length) return false;
  return crypto.timingSafeEqual(provided, computed);
}

/**
 * The Meta webhook verification handshake (GET). Meta calls the endpoint once
 * with `hub.mode=subscribe`, its configured `hub.verify_token`, and a
 * `hub.challenge` to echo. Returns the challenge to echo on a match, else null.
 *
 * Fail-closed on an unset verify token so an unconfigured deployment cannot be
 * subscribed by anyone.
 */
export function verifyWhatsAppHandshake(
  params: { mode: string | null; token: string | null; challenge: string | null },
  verifyToken: string | undefined,
): string | null {
  if (!verifyToken || params.mode !== 'subscribe' || !params.token || !params.challenge) {
    return null;
  }
  return timingSafeStringEqual(params.token, verifyToken) ? params.challenge : null;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export type DeliveryReceipt = {
  /** The provider message id (WhatsApp `wamid`) stored as `provider_message_id`. */
  providerMessageId: string;
  status: 'DELIVERED' | 'FAILED';
  error?: string;
};

// ─── Minimal structural view of the Meta statuses payload ────────────────────
// Only the fields we consume are typed; everything else is ignored. Modelled as
// optionals over `unknown`-ish shapes so a malformed payload degrades to no
// receipts rather than throwing.

type MetaError = { title?: unknown; message?: unknown; error_data?: { details?: unknown } };
type MetaStatus = { id?: unknown; status?: unknown; errors?: MetaError[] };
type MetaChange = { value?: { statuses?: MetaStatus[] } };
type MetaEntry = { changes?: MetaChange[] };
type MetaWebhookBody = { entry?: MetaEntry[] };

/**
 * Extract terminal delivery receipts from a WhatsApp Cloud API status webhook:
 * `entry[].changes[].value.statuses[]`, each carrying the `wamid` as `id` and a
 * `status` of sent | delivered | read | failed.
 *
 * - `delivered` and `read` both map to DELIVERED (read implies delivered).
 * - `failed` maps to FAILED, with the provider's error title as the reason.
 * - `sent` is skipped — the outbox already recorded ACCEPTED at send time, and a
 *   provider "sent" carries no more information than that.
 */
export function parseWhatsAppReceipts(body: unknown): DeliveryReceipt[] {
  const receipts: DeliveryReceipt[] = [];
  const entries = (body as MetaWebhookBody | null)?.entry;
  if (!Array.isArray(entries)) return receipts;

  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      for (const status of change?.value?.statuses ?? []) {
        const id = status?.id;
        if (typeof id !== 'string' || id.length === 0) continue;

        const state = String(status?.status ?? '').toLowerCase();
        if (state === 'delivered' || state === 'read') {
          receipts.push({ providerMessageId: id, status: 'DELIVERED' });
        } else if (state === 'failed') {
          receipts.push({
            providerMessageId: id,
            status: 'FAILED',
            error: metaErrorReason(status?.errors),
          });
        }
      }
    }
  }
  return receipts;
}

function metaErrorReason(errors: MetaError[] | undefined): string {
  const first = Array.isArray(errors) ? errors[0] : undefined;
  const title = readString(first?.title) ?? readString(first?.message) ?? readString(first?.error_data?.details);
  return title ?? 'Provider reported a failed delivery';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
