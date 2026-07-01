import { NextResponse } from 'next/server';
import type { ApiAuthContext } from '@/lib/auth/api';

type AgentFetchOptions = {
    method?: 'GET' | 'POST';
    body?: unknown;
};

function agentServiceUrl(): string {
    const url = process.env.AGENT_SERVICE_URL || process.env.AGENT_BASE_URL;
    if (!url) {
        throw new Error('AGENT_SERVICE_URL is not configured.');
    }
    return url.replace(/\/+$/, '');
}

function agentServiceToken(): string {
    const token = process.env.AGENT_API_TOKEN;
    if (!token || token.length < 32) {
        throw new Error('AGENT_API_TOKEN is not configured.');
    }
    return token;
}

export async function forwardAgentRequest(
    auth: ApiAuthContext,
    path: string,
    options: AgentFetchOptions = {},
): Promise<NextResponse> {
    const response = await fetch(`${agentServiceUrl()}${path}`, {
        method: options.method || 'GET',
        headers: {
            authorization: `Bearer ${agentServiceToken()}`,
            'content-type': 'application/json',
            'x-tenant-id': auth.tenantId,
            'x-user-id': auth.userId,
            'x-user-role': auth.role,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
        ? await response.json().catch(() => ({ error: 'Invalid agent service response' }))
        : { error: await response.text().catch(() => 'Agent service request failed') };

    return NextResponse.json(body, { status: response.status });
}

export function agentUnavailableResponse(error: unknown): NextResponse {
    const message = error instanceof Error ? error.message : 'Agent service is unavailable.';
    const status = message.includes('configured') ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
}
