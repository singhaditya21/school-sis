import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';
type EvidenceRow = {
  channel: Channel;
  provider: string;
  recipientHash: string;
  notificationId: string;
  acceptedStatus: string;
  finalStatus: string;
  receiptStatuses: string[];
  passed: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function targetsFromEnvironment(): Partial<Record<Channel, string>> {
  const value = JSON.parse(required('NOTIFICATION_DRILL_TARGETS_JSON')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NOTIFICATION_DRILL_TARGETS_JSON must be an object keyed by notification channel.');
  }
  const targets: Partial<Record<Channel, string>> = {};
  for (const channel of ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'] as const) {
    const target = (value as Record<string, unknown>)[channel];
    if (typeof target === 'string' && target.trim()) targets[channel] = target.trim();
  }
  if (Object.keys(targets).length === 0) throw new Error('At least one drill target is required.');
  return targets;
}

async function main() {
  const tenantId = required('NOTIFICATION_DRILL_TENANT_ID');
  const targets = targetsFromEnvironment();
  const waitSeconds = Math.min(900, Math.max(5, Number(process.env.NOTIFICATION_DRILL_WAIT_SECONDS || 120)));
  const evidenceFile = process.env.NOTIFICATION_DRILL_EVIDENCE_FILE?.trim();
  const startedAt = new Date();
  const runId = `notification-drill-${startedAt.toISOString()}`;

  const [{ enqueueNotification, processNotification, providerForChannel }, db] = await Promise.all([
    import('../src/lib/notifications/outbox'),
    import('../../../packages/api/src/db/index'),
  ]);

  const evidence: EvidenceRow[] = [];
  try {
    for (const [rawChannel, recipient] of Object.entries(targets)) {
      const channel = rawChannel as Channel;
      const provider = providerForChannel(channel);
      if (provider === 'mock' || provider === 'unconfigured') {
        throw new Error(`${channel} is ${provider}; a real-delivery drill refuses synthetic or disabled providers.`);
      }

      const queued = await enqueueNotification({
        tenantId,
        channel,
        recipient: recipient!,
        subject: `School SIS notification drill ${startedAt.toISOString()}`,
        body: `School SIS notification delivery drill. Run: ${runId}. No action is required.`,
        payload: { drillRunId: runId },
        idempotencyKey: `${runId}:${channel}`,
        maxAttempts: 1,
      });
      const accepted = await processNotification(queued.notificationId, tenantId);
      const deadline = Date.now() + waitSeconds * 1_000;
      let finalStatus = accepted.status || (accepted.success ? 'SENT' : 'FAILED');
      let receiptStatuses: string[] = [];
      const anotherWorkerHoldsClaim = accepted.metadata?.claimHeld === true;

      while (
        Date.now() < deadline
        && (finalStatus === 'SENT' || (anotherWorkerHoldsClaim && finalStatus === 'PROCESSING'))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const state = await db.runWithTenantContext(tenantId, async () => {
          const [outbox, events] = await Promise.all([
            db.pool.query<{ status: string }>(
              'SELECT status FROM notification_outbox WHERE tenant_id = $1 AND id = $2',
              [tenantId, queued.notificationId],
            ),
            db.pool.query<{ status: string }>(
              `SELECT status FROM notification_delivery_events
               WHERE tenant_id = $1 AND notification_id = $2
                 AND metadata ->> 'receiptAuthenticated' = 'true'
               ORDER BY created_at`,
              [tenantId, queued.notificationId],
            ),
          ]);
          return {
            status: outbox.rows[0]?.status || finalStatus,
            receipts: events.rows.map((row) => row.status),
          };
        });
        finalStatus = state.status;
        receiptStatuses = state.receipts;
      }

      evidence.push({
        channel,
        provider,
        recipientHash: crypto.createHash('sha256').update(recipient!).digest('hex').slice(0, 16),
        notificationId: queued.notificationId,
        acceptedStatus: accepted.status || (accepted.success ? 'SENT' : 'FAILED'),
        finalStatus,
        receiptStatuses,
        passed: finalStatus === 'DELIVERED' && receiptStatuses.includes('DELIVERED'),
      });
    }
  } finally {
    await db.pool.end();
  }

  const artifact = {
    schemaVersion: 1,
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    tenantId,
    waitSeconds,
    results: evidence,
    passed: evidence.length > 0 && evidence.every((row) => row.passed),
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (evidenceFile) fs.writeFileSync(path.resolve(evidenceFile), serialized, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(serialized);
  if (!artifact.passed) throw new Error('One or more channels lacked a provider-confirmed DELIVERED receipt.');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
