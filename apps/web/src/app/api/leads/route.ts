import { NextResponse } from 'next/server';
import { captureLeadAction } from '@/lib/actions/marketing';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { logger } from '@/lib/observability/logger';
import { screenLeadSubmission, LEAD_HONEYPOT_FIELD, LEAD_TIMESTAMP_FIELD } from '@/lib/marketing/lead-screening';

function clientIpFrom(request: Request): string {
    return (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown')
        .split(',')[0]
        .trim()
        .toLowerCase() || 'unknown';
}

export async function POST(request: Request) {
    try {
        const ipLimitError = await consumeRateLimit(clientIpFrom(request), {
            scope: 'lead_capture_ip',
            maxAttempts: 10,
            degradedMaxAttempts: 1,
            endpointClass: 'public-write',
            message: 'Too many lead submissions. Please try again later.',
        });
        if (ipLimitError) {
            return NextResponse.json({ error: ipLimitError }, { status: 429 });
        }

        const formData = await request.formData();

        // Vendor-free bot screening. A positive signal is a silent drop: respond 200
        // (the bot learns nothing) and write no lead. Non-breaking — a form that omits
        // the screening fields is simply not screened on them.
        const screen = screenLeadSubmission({
            honeypot: formData.get(LEAD_HONEYPOT_FIELD),
            loadedAt: formData.get(LEAD_TIMESTAMP_FIELD),
        });
        if (screen.botLike) {
            logger.warn('lead_capture.bot_dropped', 'Lead submission dropped by bot screening', {
                source: 'api',
                metadata: { signal: screen.signal, ip: clientIpFrom(request) },
            });
            return NextResponse.json({ success: true });
        }

        const contactEmail = String(formData.get('contactEmail') || '').trim().toLowerCase();
        if (contactEmail) {
            const emailLimitError = await consumeRateLimit(contactEmail, {
                scope: 'lead_capture_email',
                maxAttempts: 3,
                degradedMaxAttempts: 1,
                endpointClass: 'public-write',
                message: 'Too many lead submissions for this email. Please try again later.',
            });
            if (emailLimitError) {
                return NextResponse.json({ error: emailLimitError }, { status: 429 });
            }
        }

        const result = await captureLeadAction(formData);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('lead_capture.failed', 'Lead capture request failed', {
            source: 'api',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Internal Server Error processing lead.' }, { status: 500 });
    }
}
