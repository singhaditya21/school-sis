import { NextResponse } from 'next/server';
import { logger } from '@/lib/observability/logger';
import {
  applyNotificationReceipt,
  parseBridgeReceipt,
  parseResendReceipt,
  parseTwilioReceipt,
  verifyBridgeReceiptSignature,
  verifyResendReceiptSignature,
  verifyTwilioReceiptSignature,
  type NotificationReceipt,
  type ReceiptProvider,
} from '@/lib/notifications/receipts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_RECEIPT_BYTES = 256 * 1024;
const BRIDGE_PROVIDERS = new Set<ReceiptProvider>(['msg91', 'firebase', 'smtp']);

function signatureFailure() {
  return NextResponse.json({ error: 'Invalid notification receipt signature.' }, { status: 401 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await context.params;
  const provider = rawProvider.trim().toLowerCase() as ReceiptProvider;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: 'Notification receipt is too large.' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: 'Notification receipt is too large.' }, { status: 413 });
  }

  try {
    let receipt: NotificationReceipt | null;
    if (provider === 'twilio') {
      const signature = request.headers.get('x-twilio-signature') || '';
      if (!verifyTwilioReceiptSignature(rawBody, signature)) return signatureFailure();
      receipt = parseTwilioReceipt(rawBody);
    } else if (provider === 'resend') {
      const headers = {
        id: request.headers.get('svix-id') || '',
        timestamp: request.headers.get('svix-timestamp') || '',
        signature: request.headers.get('svix-signature') || '',
      };
      if (!verifyResendReceiptSignature(rawBody, headers)) return signatureFailure();
      receipt = parseResendReceipt(rawBody, headers.id);
    } else if (BRIDGE_PROVIDERS.has(provider)) {
      const signature = request.headers.get('x-school-sis-signature') || '';
      if (!verifyBridgeReceiptSignature(rawBody, signature)) return signatureFailure();
      receipt = parseBridgeReceipt(rawBody, provider as Exclude<ReceiptProvider, 'twilio' | 'resend'>);
    } else {
      return NextResponse.json({ error: 'Unsupported notification receipt provider.' }, { status: 404 });
    }

    if (!receipt) return NextResponse.json({ received: true, ignored: true });
    const result = await applyNotificationReceipt(receipt);
    return NextResponse.json({
      received: true,
      status: result.status,
      duplicate: result.duplicate,
      ignoredAsStale: result.ignoredAsStale,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notification receipt processing failed.';
    logger.error('notification.receipt_failed', 'Notification receipt processing failed', {
      source: 'notifications',
      metadata: { provider, error: message },
    });
    const retryable = message.includes('was not found');
    return NextResponse.json(
      { error: retryable ? 'Notification is not ready for receipt processing.' : 'Notification receipt was rejected.' },
      { status: retryable ? 503 : 400 },
    );
  }
}
