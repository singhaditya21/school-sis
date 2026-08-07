import { NextResponse } from 'next/server';
import { requireBearerServiceAuth } from '@/lib/auth/api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const authError = requireBearerServiceAuth(request, 'AGENT_WEBHOOK_SECRET', {
        serviceName: 'Agent webhook',
    });
    if (authError) return authError;

    return NextResponse.json(
        { error: 'Agent incident triage is unavailable until a live worker is configured.' },
        { status: 503 },
    );
}
