import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import { agentUnavailableResponse, forwardAgentRequest } from '@/lib/agents/client';

export const dynamic = 'force-dynamic';

const AGENT_ROLES = [
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'ACCOUNTANT',
    'ADMISSION_COUNSELOR',
    'TEACHER',
] as const;

const AgentQuerySchema = z.object({
    query: z.string().trim().min(1).max(4000),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ agent: string }> },
) {
    const auth = await requireApiAuth(AGENT_ROLES);
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = AgentQuerySchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid agent query' }, { status: 400 });
    }

    const { agent } = await params;
    try {
        return await forwardAgentRequest(
            auth.context,
            `/api/v1/agents/${encodeURIComponent(agent)}/query_async`,
            {
                method: 'POST',
                body: {
                    query: parsed.data.query,
                    tenant_id: auth.context.tenantId,
                    user_id: auth.context.userId,
                },
            },
        );
    } catch (error) {
        return agentUnavailableResponse(error);
    }
}
