import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enqueuePlatformJob } from '@/lib/worker/client';
import { requireBearerServiceAuth } from '@/lib/auth/api';

export const dynamic = 'force-dynamic';

const WebhookPayloadSchema = z.object({
    source: z.string().trim().max(100).optional(),
    description: z.string().trim().max(4000).optional(),
    data: z.unknown().optional(),
    alerts: z.array(z.object({
        labels: z.record(z.unknown()).optional(),
        annotations: z.record(z.unknown()).optional(),
    })).max(25).optional(),
}).passthrough();

function stringifyBounded(value: unknown): string {
    return JSON.stringify(value ?? {}).slice(0, 4000);
}

export async function POST(request: Request) {
    try {
        const authError = requireBearerServiceAuth(request, 'AGENT_WEBHOOK_SECRET', {
            serviceName: 'Agent webhook',
        });
        if (authError) return authError;

        const parsed = WebhookPayloadSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
        }

        const payload = parsed.data;
        let source = payload.source?.trim() || 'unknown_source';
        let issueDescription = payload.description?.trim() || stringifyBounded(payload.data);

        if (payload.alerts?.length) {
            source = 'grafana';
            issueDescription = payload.alerts
                .map((alert) => {
                    const labels = alert.labels || {};
                    const annotations = alert.annotations || {};
                    const alertName = typeof labels.alertname === 'string' ? labels.alertname : 'Unknown';
                    const description = typeof annotations.description === 'string'
                        ? annotations.description
                        : 'No description';
                    return `Alert: ${alertName}\nDescription: ${description}`;
                })
                .join('\n\n')
                .slice(0, 4000);
        }

        if (!issueDescription || issueDescription === '{}') {
            return NextResponse.json({ error: 'Missing issue description' }, { status: 400 });
        }

        await enqueuePlatformJob('agent-incident-triage', {
            source,
            issueDescription,
            receivedAt: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            message: 'Incident queued for triage',
            source,
        }, { status: 202 });
    } catch (error) {
        console.error('[agent-webhook] error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
