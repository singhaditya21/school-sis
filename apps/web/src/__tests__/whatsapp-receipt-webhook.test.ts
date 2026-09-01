import crypto from 'node:crypto';

// The outbox pulls in @/lib/db (pool + tenant-context helpers). Mock it so the
// receipt path runs its real SQL-building logic against jest spies — the two
// runWith* wrappers just invoke their callback so the inner queries execute.
jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
  runWithRlsBypass: jest.fn((_justification: unknown, fn: () => unknown) => fn()),
  runWithTenantContext: jest.fn((_tenantId: unknown, fn: () => unknown) => fn()),
  RLS_BYPASS_JUSTIFICATIONS: {
    NOTIFICATION_RECEIPT: { id: 'notifications.provider-receipt-lookup', reason: 'test' },
    NOTIFICATION_SWEEP: { id: 'worker.notification-sweep', reason: 'test' },
  },
}));

import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import { recordDeliveryReceipt } from '@/lib/notifications/outbox';
import {
  parseWhatsAppReceipts,
  verifyWhatsAppHandshake,
  verifyWhatsAppSignature,
} from '@/lib/notifications/receipts';

const query = pool.query as jest.Mock;

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifyWhatsAppSignature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account' });
  const secret = 'app-secret';

  it('accepts a correct sha256 HMAC of the raw body', () => {
    expect(verifyWhatsAppSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    expect(verifyWhatsAppSignature(body, sign(body, 'other-secret'), secret)).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    const signature = sign(body, secret);
    expect(verifyWhatsAppSignature(body + ' ', signature, secret)).toBe(false);
  });

  it('fails closed when the secret is unset', () => {
    expect(verifyWhatsAppSignature(body, sign(body, secret), undefined)).toBe(false);
  });

  it('fails closed when the header is missing or malformed', () => {
    expect(verifyWhatsAppSignature(body, null, secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, 'not-a-signature', secret)).toBe(false);
  });
});

describe('verifyWhatsAppHandshake', () => {
  it('echoes the challenge when mode and verify token match', () => {
    expect(
      verifyWhatsAppHandshake({ mode: 'subscribe', token: 'verify-me', challenge: '42' }, 'verify-me'),
    ).toBe('42');
  });

  it('returns null on a wrong verify token', () => {
    expect(
      verifyWhatsAppHandshake({ mode: 'subscribe', token: 'wrong', challenge: '42' }, 'verify-me'),
    ).toBeNull();
  });

  it('returns null on a non-subscribe mode', () => {
    expect(
      verifyWhatsAppHandshake({ mode: 'unsubscribe', token: 'verify-me', challenge: '42' }, 'verify-me'),
    ).toBeNull();
  });

  it('fails closed when the verify token is unset', () => {
    expect(
      verifyWhatsAppHandshake({ mode: 'subscribe', token: 'verify-me', challenge: '42' }, undefined),
    ).toBeNull();
  });
});

describe('parseWhatsAppReceipts', () => {
  function payload(statuses: Array<Record<string, unknown>>) {
    return { entry: [{ changes: [{ value: { statuses } }] }] };
  }

  it('maps delivered and read to DELIVERED and failed to FAILED', () => {
    const receipts = parseWhatsAppReceipts(
      payload([
        { id: 'wamid.A', status: 'delivered' },
        { id: 'wamid.B', status: 'read' },
        { id: 'wamid.C', status: 'failed', errors: [{ title: 'Message undeliverable' }] },
      ]),
    );
    expect(receipts).toEqual([
      { providerMessageId: 'wamid.A', status: 'DELIVERED' },
      { providerMessageId: 'wamid.B', status: 'DELIVERED' },
      { providerMessageId: 'wamid.C', status: 'FAILED', error: 'Message undeliverable' },
    ]);
  });

  it('ignores non-terminal "sent" statuses and entries with no message id', () => {
    const receipts = parseWhatsAppReceipts(
      payload([{ id: 'wamid.A', status: 'sent' }, { status: 'delivered' }]),
    );
    expect(receipts).toEqual([]);
  });

  it('returns nothing for a malformed or empty payload', () => {
    expect(parseWhatsAppReceipts(null)).toEqual([]);
    expect(parseWhatsAppReceipts({})).toEqual([]);
    expect(parseWhatsAppReceipts({ entry: 'nope' })).toEqual([]);
  });
});

describe('recordDeliveryReceipt', () => {
  beforeEach(() => {
    query.mockReset();
    (runWithRlsBypass as jest.Mock).mockClear();
    (runWithTenantContext as jest.Mock).mockClear();
  });

  it('resolves the row under RLS bypass, then records the receipt inside its tenant', async () => {
    const row = {
      id: 'notif-1',
      tenantId: 'tenant-1',
      jobId: 'job-1',
      payload: { messageId: 'msg-1' },
    };
    query
      .mockResolvedValueOnce({ rows: [row] }) // (1) lookup by provider + provider_message_id
      .mockResolvedValue({ rows: [] }); // (2) messages UPDATE, (3) events INSERT, (4) outbox UPDATE

    const result = await recordDeliveryReceipt({
      provider: 'meta_cloud',
      providerMessageId: 'wamid.A',
      status: 'DELIVERED',
    });

    expect(result).toEqual({ matched: true });

    // Lookup is cross-tenant and keyed on (provider, provider_message_id).
    expect(runWithRlsBypass).toHaveBeenCalledTimes(1);
    const lookup = query.mock.calls[0];
    expect(lookup[0]).toMatch(/FROM notification_outbox/i);
    expect(lookup[1]).toEqual(['meta_cloud', 'wamid.A']);

    // Writes happen inside the row's own tenant context.
    expect(runWithTenantContext).toHaveBeenCalledWith('tenant-1', expect.any(Function));

    // The outbox promotion is tenant-scoped and only advances from SENT.
    const outboxUpdate = query.mock.calls.find(([sql]) => /UPDATE notification_outbox/i.test(sql));
    expect(outboxUpdate).toBeDefined();
    expect(outboxUpdate?.[0]).toMatch(/status = 'SENT'/);
    expect(outboxUpdate?.[1]).toEqual(['DELIVERED', null, 'tenant-1', 'notif-1']);

    // A delivery event is ledgered for the matched notification.
    const eventInsert = query.mock.calls.find(([sql]) => /INSERT INTO notification_delivery_events/i.test(sql));
    expect(eventInsert?.[1]?.[0]).toBe('tenant-1'); // tenant_id
    expect(eventInsert?.[1]?.[1]).toBe('notif-1'); // notification_id
    expect(eventInsert?.[1]?.[4]).toBe('meta_cloud'); // provider
  });

  it('is a no-op when no outbox row matches the provider message id', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await recordDeliveryReceipt({
      provider: 'meta_cloud',
      providerMessageId: 'wamid.unknown',
      status: 'DELIVERED',
    });

    expect(result).toEqual({ matched: false });
    expect(runWithTenantContext).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1); // only the lookup
  });

  it('does not query at all for an empty provider message id', async () => {
    const result = await recordDeliveryReceipt({
      provider: 'meta_cloud',
      providerMessageId: '',
      status: 'FAILED',
    });
    expect(result).toEqual({ matched: false });
    expect(query).not.toHaveBeenCalled();
  });
});
