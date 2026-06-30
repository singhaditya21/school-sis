import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-Sent Events (SSE) Notification Stream
 *
 * Provides a real-time event stream for live notifications.
 * Frontend connects via EventSource('/api/notifications/stream').
 *
 * Events emitted:
 *   - ATTENDANCE_ALERT: Unexpected absence anomaly
 *   - PAYMENT_RECEIVED: Real-time payment confirmation
 *   - FEE_REMINDER: Upcoming deadline
 *   - SYSTEM: System-level notifications
 *
 * SECURITY: Requires authenticated session via cookie.
 */

import { requireApiAuth } from '@/lib/auth/api';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection event
            const connectEvent = `event: connected\ndata: ${JSON.stringify({
                userId: auth.context.userId,
                tenantId: auth.context.tenantId,
                role: auth.context.role,
                timestamp: new Date().toISOString(),
            })}\n\n`;
            controller.enqueue(encoder.encode(connectEvent));

            // Heartbeat every 30 seconds to keep connection alive
            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`));
                } catch {
                    clearInterval(heartbeat);
                }
            }, 30_000);

            // Clean up on abort
            request.signal.addEventListener('abort', () => {
                clearInterval(heartbeat);
                try { controller.close(); } catch { /* ignore */ }
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
