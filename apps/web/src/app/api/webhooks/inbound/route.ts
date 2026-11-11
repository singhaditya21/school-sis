import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import {
    deriveTenantInboundWebhookToken,
    ingestInboundWebhookLead,
} from '@/lib/metadata/inbound-webhook';
import { logger } from '@/lib/observability/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INBOUND_BODY_BYTES = 64 * 1024;

function extractInboundIp(request: NextRequest): string {
    return (
        request.headers.get('x-vercel-forwarded-for') ||
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown'
    )
        .split(',')[0]
        .trim()
        .toLowerCase() || 'unknown';
}

function safeEqualTokens(provided: string, expected: string): boolean {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

/**
 * @module app/api/webhooks/inbound/route
 *
 * Track H: Inbound Webhook & External Lead-Ad Connector (MuleSoft / Zapier / Meta Lead Ads Parity):
 * Accepts JSON payloads from external ad platforms or automation tools, verifies a tenant-bound
 * cryptographic token (`x-scholarmind-webhook-token`), enforces rate limits, and writes under RLS.
 */
export async function POST(request: NextRequest) {
    try {
        const inboundSecret = process.env.INBOUND_WEBHOOK_SECRET?.trim() || '';
        if (inboundSecret.length < 32) {
            return NextResponse.json(
                { success: false, error: 'Inbound webhook connector is not configured.' },
                { status: 503, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        const clientIp = extractInboundIp(request);
        const ipRateMessage = await consumeRateLimit(clientIp, {
            scope: 'inbound_webhook_ip',
            maxAttempts: 60,
            degradedMaxAttempts: 10,
            endpointClass: 'public-write',
            message: 'Too many inbound webhook requests. Please retry later.',
        });
        if (ipRateMessage) {
            return NextResponse.json(
                { success: false, error: ipRateMessage },
                { status: 429, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        const rawText = await request.text();
        if (Buffer.byteLength(rawText, 'utf8') > MAX_INBOUND_BODY_BYTES) {
            return NextResponse.json(
                { success: false, error: 'Inbound webhook payload exceeds the 64 KB limit.' },
                { status: 413, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        let body: {
            tenantId?: string;
            objectApiName?: string;
            payload?: Record<string, unknown>;
            fieldMappings?: Record<string, string>;
            defaultValues?: Record<string, unknown>;
            sourceName?: string;
        };
        try {
            body = JSON.parse(rawText);
        } catch {
            return NextResponse.json(
                { success: false, error: 'Invalid JSON payload.' },
                { status: 400, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        const tenantId = String(body?.tenantId || '').trim();
        const objectApiName = String(body?.objectApiName || '').trim().toLowerCase();
        if (!UUID_RE.test(tenantId) || !objectApiName) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Valid tenantId and objectApiName are required in the inbound webhook body.',
                },
                { status: 400, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        const providedToken = (request.headers.get('x-scholarmind-webhook-token') || '').trim();
        const expectedTenantToken = deriveTenantInboundWebhookToken(inboundSecret, tenantId);
        if (!safeEqualTokens(providedToken, expectedTenantToken)) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized inbound webhook token.' },
                { status: 401, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        const tenantRateMessage = await consumeRateLimit(tenantId, {
            scope: 'inbound_webhook_tenant',
            maxAttempts: 120,
            degradedMaxAttempts: 20,
            endpointClass: 'public-write',
            message: 'Tenant inbound webhook rate limit exceeded.',
        });
        if (tenantRateMessage) {
            return NextResponse.json(
                { success: false, error: tenantRateMessage },
                { status: 429, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        const externalPayload =
            body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
                ? body.payload
                : {};

        const result = await ingestInboundWebhookLead({
            tenantId,
            objectApiName,
            externalPayload,
            fieldMappings: body.fieldMappings || {},
            defaultValues: body.defaultValues || {},
            sourceName: body.sourceName || 'EXTERNAL_WEBHOOK_API',
        });

        if (!result.success) {
            return NextResponse.json(result, {
                status: 422,
                headers: { 'Cache-Control': 'no-store' },
            });
        }

        return NextResponse.json(result, {
            status: 201,
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        logger.error('webhooks.inbound.route_error', 'Unhandled inbound webhook error', {
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json(
            { success: false, error: 'Invalid inbound webhook payload.' },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
