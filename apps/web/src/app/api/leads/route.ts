import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { captureLeadAction } from '@/lib/actions/marketing';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { parseLeadIntake } from '@/lib/marketing/lead-intake';
import { logger } from '@/lib/observability/logger';

function clientIpFrom(request: Request): string {
    return (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown')
        .split(',')[0]
        .trim()
        .toLowerCase() || 'unknown';
}

function authorizedLeadProxy(request: Request): boolean {
    const expected = process.env.LEAD_CAPTURE_PROXY_SECRET;
    if (!expected) return process.env.NODE_ENV !== 'production';
    if (expected.length < 32) return false;
    const supplied = request.headers.get('x-lead-capture-token') || '';
    if (supplied.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}

export async function POST(request: Request) {
    try {
        if (!authorizedLeadProxy(request)) {
            return json({ error: 'Lead intake is unavailable.' }, process.env.LEAD_CAPTURE_PROXY_SECRET ? 401 : 503);
        }

        const formData = await request.formData();
        const parsed = parseLeadIntake(formData);
        if ('bot' in parsed) {
            return parsed.bot ? json({ success: true }, 202) : json({ error: parsed.error }, 400);
        }

        const ipLimitError = await consumeRateLimit(clientIpFrom(request), {
            scope: 'lead_capture_ip',
            maxAttempts: 10,
            degradedMaxAttempts: 1,
            endpointClass: 'public-write',
            message: 'Too many lead submissions. Please try again later.',
        });
        if (ipLimitError) {
            return json({ error: ipLimitError }, 429);
        }

        const emailLimitError = await consumeRateLimit(parsed.data.contactEmail, {
            scope: 'lead_capture_email',
            maxAttempts: 3,
            degradedMaxAttempts: 1,
            endpointClass: 'public-write',
            message: 'Too many lead submissions for this email. Please try again later.',
        });
        if (emailLimitError) {
            return json({ error: emailLimitError }, 429);
        }

        const result = await captureLeadAction(parsed.data, {
            clientIp: clientIpFrom(request),
            referrer: request.headers.get('x-lead-referrer') || request.headers.get('referer'),
            userAgent: request.headers.get('user-agent'),
        });

        if (result.error) {
            return json({ error: result.error }, 400);
        }

        return json({ success: true });
    } catch (error) {
        logger.error('lead_capture.failed', 'Lead capture request failed', {
            source: 'api',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return json({ error: 'Internal Server Error processing lead.' }, 500);
    }
}
