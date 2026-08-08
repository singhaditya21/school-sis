const poolQuery = jest.fn();
const clientQuery = jest.fn();
const clientRelease = jest.fn();
const emailSend = jest.fn();
const recordSreIncident = jest.fn();

jest.mock('@/lib/db', () => ({
  pool: {
    query: (...args: unknown[]) => poolQuery(...args),
    connect: jest.fn(async () => ({ query: clientQuery, release: clientRelease })),
  },
  RLS_BYPASS_JUSTIFICATIONS: { NOTIFICATION_SWEEP: { id: 'notifications.sweep' } },
  runWithRlsBypass: jest.fn(async (_reason: unknown, callback: () => Promise<unknown>) => callback()),
  runWithTenantContext: jest.fn(async (_tenantId: string, callback: () => Promise<unknown>) => callback()),
}));

jest.mock('@/lib/providers/email', () => ({
  getEmailProvider: () => ({ send: emailSend }),
}));

jest.mock('@/lib/providers/sms', () => ({
  getSmsProvider: () => ({ send: jest.fn() }),
}));

jest.mock('@/lib/providers/whatsapp', () => ({
  getWhatsAppProvider: () => ({ send: jest.fn() }),
}));

jest.mock('@/lib/providers/push', () => ({
  getPushProvider: () => ({ send: jest.fn() }),
}));

jest.mock('@/lib/worker/client', () => ({
  enqueueTenantJob: jest.fn(),
}));

jest.mock('@/lib/integrations/runtime-mode', () => ({
  mockRuntimeIsAllowed: () => true,
  notificationProviderForChannel: (channel: string) => channel === 'IN_APP' ? 'database' : 'mock',
}));

jest.mock('@/lib/observability/logger', () => ({
  recordSreIncident: (...args: unknown[]) => recordSreIncident(...args),
}));

import { processDueNotifications, processNotification } from '@/lib/notifications/outbox';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const NOTIFICATION_ID = '9ea1a382-7f2d-4e2f-b06b-9c7a96b86775';

function claimedRow() {
  return {
    id: NOTIFICATION_ID,
    tenantId: TENANT_ID,
    jobId: '6e9501eb-0a70-4fad-aeda-2d97861f4ad7',
    channel: 'EMAIL',
    status: 'PROCESSING',
    provider: 'mock',
    recipient: 'family@example.edu',
    recipientUserId: null,
    subject: 'Attendance update',
    body: 'Present',
    payload: { messageId: 'linked-message-1' },
    attempts: 1,
    maxAttempts: 3,
  };
}

function successfulBookkeeping() {
  clientQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: null };
    if (sql.includes('UPDATE notification_outbox')) {
      return { rows: [{ status: values?.[0] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notification outbox delivery claims', () => {
  it('atomically claims once so concurrent workers cannot send the same notification twice', async () => {
    let claimCount = 0;
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET status = 'PROCESSING'")) {
        claimCount += 1;
        return claimCount === 1
          ? { rows: [claimedRow()], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT channel, status, provider, attempts')) {
        return {
          rows: [{ channel: 'EMAIL', status: 'PROCESSING', provider: 'mock', attempts: 1, maxAttempts: 3 }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    });
    successfulBookkeeping();

    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    let providerAccepted!: () => void;
    const accepted = new Promise<{ success: true; data: { messageId: string } }>((resolve) => {
      providerAccepted = () => resolve({ success: true, data: { messageId: 'provider-1' } });
    });
    emailSend.mockImplementation(async () => {
      providerStarted();
      return accepted;
    });

    const firstWorker = processNotification(NOTIFICATION_ID, TENANT_ID);
    await started;
    const secondResult = await processNotification(NOTIFICATION_ID, TENANT_ID);

    expect(secondResult).toMatchObject({
      success: true,
      status: 'PROCESSING',
      metadata: { skipped: true, claimHeld: true },
    });
    expect(emailSend).toHaveBeenCalledTimes(1);

    providerAccepted();
    await expect(firstWorker).resolves.toMatchObject({ success: true, status: 'SENT' });
    expect(emailSend).toHaveBeenCalledTimes(1);

    const claimSql = String(poolQuery.mock.calls[0]?.[0]);
    expect(claimSql).toContain("SET status = 'PROCESSING'");
    expect(claimSql).toContain("status IN ('PENDING', 'QUEUED', 'FAILED')");
    expect(claimSql).toContain('attempts = attempts + 1');
  });

  it('commits outbox, event, and monotonic linked-message bookkeeping in one transaction', async () => {
    poolQuery.mockResolvedValue({ rows: [claimedRow()], rowCount: 1 });
    successfulBookkeeping();
    emailSend.mockResolvedValue({ success: true, data: { messageId: 'provider-1' } });

    await expect(processNotification(NOTIFICATION_ID, TENANT_ID)).resolves.toMatchObject({
      success: true,
      status: 'SENT',
    });

    const statements = clientQuery.mock.calls.map(([sql]) => String(sql));
    const beginIndex = statements.indexOf('BEGIN');
    const outboxIndex = statements.findIndex((sql) => sql.includes('UPDATE notification_outbox'));
    const eventIndex = statements.findIndex((sql) => sql.includes('INSERT INTO notification_delivery_events'));
    const messageIndex = statements.findIndex((sql) => sql.includes('UPDATE messages'));
    const commitIndex = statements.indexOf('COMMIT');
    expect(beginIndex).toBeLessThan(outboxIndex);
    expect(outboxIndex).toBeLessThan(eventIndex);
    expect(eventIndex).toBeLessThan(messageIndex);
    expect(messageIndex).toBeLessThan(commitIndex);

    const outboxUpdate = clientQuery.mock.calls[outboxIndex];
    expect(String(outboxUpdate[0])).toContain("status = 'PROCESSING'");
    expect(outboxUpdate[1]?.[0]).toBe('SENT');
    const messageUpdate = String(clientQuery.mock.calls[messageIndex]?.[0]);
    expect(messageUpdate).toContain("WHEN status = 'DELIVERED' AND $1 <> 'DELIVERED' THEN status");
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it('keeps an accepted delivery non-retryable when its bookkeeping transaction fails', async () => {
    poolQuery.mockResolvedValue({ rows: [claimedRow()], rowCount: 1 });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: null };
      if (sql.includes('UPDATE notification_outbox')) throw new Error('database write unavailable');
      return { rows: [], rowCount: 1 };
    });
    emailSend.mockResolvedValue({ success: true, data: { messageId: 'provider-accepted-1' } });

    const result = await processNotification(NOTIFICATION_ID, TENANT_ID);

    expect(result).toMatchObject({
      success: false,
      status: 'PROCESSING',
      metadata: {
        providerAccepted: true,
        deliveryStateUnknown: true,
        reconciliationRequired: true,
      },
    });
    expect(result.error).toMatch(/automatic retry is blocked/i);
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(recordSreIncident).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'CRITICAL',
      fingerprint: `notification_bookkeeping_unknown:${NOTIFICATION_ID}`,
      metadata: expect.objectContaining({
        providerAccepted: true,
        providerMessageId: 'provider-accepted-1',
        reconciliationRequired: true,
      }),
    }));
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it('blocks automatic retry when a provider transport outcome is unknown', async () => {
    poolQuery.mockResolvedValue({ rows: [claimedRow()], rowCount: 1 });
    emailSend.mockResolvedValue({
      success: false,
      error: 'socket disconnected after request write',
      outcome: 'UNKNOWN',
    });

    const result = await processNotification(NOTIFICATION_ID, TENANT_ID);

    expect(result).toMatchObject({
      success: false,
      outcome: 'UNKNOWN',
      status: 'PROCESSING',
      metadata: { deliveryStateUnknown: true, reconciliationRequired: true },
    });
    expect(result.error).toMatch(/automatic retry is blocked/i);
    expect(clientQuery).not.toHaveBeenCalled();
    expect(recordSreIncident).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'CRITICAL',
      fingerprint: `notification_delivery_unknown:${NOTIFICATION_ID}`,
      metadata: expect.objectContaining({ reconciliationRequired: true }),
    }));
  });

  it('persists an explicit provider rejection as retryable FAILED state', async () => {
    poolQuery.mockResolvedValue({ rows: [claimedRow()], rowCount: 1 });
    successfulBookkeeping();
    emailSend.mockResolvedValue({ success: false, error: 'provider rejected request', outcome: 'REJECTED' });

    await expect(processNotification(NOTIFICATION_ID, TENANT_ID)).resolves.toMatchObject({
      success: false,
      status: 'FAILED',
      error: 'provider rejected request',
    });

    const outcomeCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE notification_outbox'));
    expect(outcomeCall?.[1]?.[0]).toBe('FAILED');
    expect(outcomeCall?.[1]?.[4]).toBe('2 minutes');
  });

  it('does not count a contended PROCESSING claim as a successful delivery', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, tenant_id AS "tenantId"')) {
        return { rows: [{ id: NOTIFICATION_ID, tenantId: TENANT_ID }], rowCount: 1 };
      }
      if (sql.includes("SET status = 'PROCESSING'")) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT channel, status, provider, attempts')) {
        return {
          rows: [{ channel: 'EMAIL', status: 'PROCESSING', provider: 'mock', attempts: 1, maxAttempts: 3 }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    });

    await expect(processDueNotifications(10)).resolves.toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('never includes a claimed PROCESSING row in the automatic retry sweep', async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(processDueNotifications(10)).resolves.toEqual({ processed: 0, succeeded: 0, failed: 0 });

    const sweepSql = String(poolQuery.mock.calls[0]?.[0]);
    expect(sweepSql).toContain("status IN ('PENDING', 'QUEUED', 'FAILED')");
    expect(sweepSql).not.toContain("status IN ('PENDING', 'QUEUED', 'PROCESSING'");
  });
});
