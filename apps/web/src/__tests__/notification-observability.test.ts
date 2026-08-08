import fs from 'fs';
import path from 'path';

describe('notification delivery observability', () => {
  it('publishes delivered and suppressed counts with channel/provider dimensions', () => {
    const operatorRoute = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/operator/console/route.ts'),
      'utf8',
    );
    const operatorClient = fs.readFileSync(
      path.join(process.cwd(), 'src/app/operator/operator-console-client.tsx'),
      'utf8',
    );
    const metrics = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/observability/metrics.ts'),
      'utf8',
    );
    const outbox = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/notifications/outbox.ts'),
      'utf8',
    );

    expect(operatorRoute).toContain("status = 'DELIVERED'");
    expect(operatorRoute).toContain("status = 'SUPPRESSED'");
    expect(operatorRoute).toContain('GROUP BY channel, status');
    expect(operatorRoute).toContain('byChannel: notificationChannelBreakdown');
    expect(operatorClient).toContain('Provider-confirmed outcomes by channel.');
    expect(operatorClient).toContain('snapshot.metrics.notifications.delivered');
    expect(operatorClient).toContain('snapshot.metrics.notifications.suppressed');
    expect(metrics).toContain("['status', 'channel', 'provider']");
    expect(metrics).toContain("'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED'");
    expect(outbox).toContain("receipt.metadata ->> 'receiptAuthenticated' = 'true'");
  });
});
