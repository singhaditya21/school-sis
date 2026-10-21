import { NextRequest, NextResponse } from 'next/server';
import { ingestInboundWebhookLead } from '@/lib/actions/metadata-engine';

/**
 * @module app/api/webhooks/inbound/route
 *
 * Track H: Inbound Webhook & External Lead-Ad Connector (MuleSoft / Zapier / Meta Lead Ads Parity):
 * Accepts JSON payloads from external ad platforms or automation tools (Meta Lead Ads, Google Forms,
 * Shiksha, Collegedunia, Zapier), maps external keys to target ScholarMind Custom Object fields,
 * enforces Duplicate Rules, and triggers active workflows.
 */
export async function POST(request: NextRequest) {
    try {
        const configuredToken =
            process.env.INBOUND_WEBHOOK_SECRET || process.env.WEBHOOK_SIGNING_SECRET;
        const providedToken = request.headers.get('x-scholarmind-webhook-token');

        if (configuredToken && providedToken !== configuredToken) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized inbound webhook token.' },
                { status: 401 },
            );
        }

        const body = (await request.json()) as {
            tenantId?: string;
            objectApiName?: string;
            payload?: Record<string, unknown>;
            fieldMappings?: Record<string, string>;
            defaultValues?: Record<string, unknown>;
            sourceName?: string;
        };

        const tenantId = String(body.tenantId || '').trim();
        const objectApiName = String(body.objectApiName || '').trim().toLowerCase();
        const externalPayload =
            body.payload && typeof body.payload === 'object' ? body.payload : {};

        if (!tenantId || !objectApiName) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Both tenantId and objectApiName are required in the inbound webhook body.',
                },
                { status: 400 },
            );
        }

        const result = await ingestInboundWebhookLead({
            tenantId,
            objectApiName,
            externalPayload,
            fieldMappings: body.fieldMappings || {},
            defaultValues: body.defaultValues || {},
            sourceName: body.sourceName || 'EXTERNAL_WEBHOOK_API',
        });

        if (!result.success) {
            return NextResponse.json(result, { status: 422 });
        }

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error ? error.message : 'Invalid inbound webhook payload.',
            },
            { status: 400 },
        );
    }
}
