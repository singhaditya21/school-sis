import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    agentUnavailableResponse,
    ensureAgentServiceConfigured,
    forwardAgentRequest,
} from '@/lib/agents/client';
import {
    aiBudgetErrorResponse,
    estimateAiBudget,
    loadAiBudgetPolicy,
    reserveAiBudget,
    settleAiBudget,
    type AiBudgetReservation,
} from '@/lib/ai/budget';
import { loadAgentProxyMetering } from '@/lib/ai/providers';
import { assessAiPrompt } from '@/lib/ai/safety';
import { isAllowedAgentId } from '@/lib/agents/policy';

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
    let reservation: AiBudgetReservation | undefined;
    const auth = await requireApiAuth(AGENT_ROLES);
    if (auth.ok === false) return auth.response;

    const limitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
        scope: 'ai_agent_query',
        maxAttempts: 20,
        degradedMaxAttempts: 1,
        endpointClass: 'ai',
        message: 'AI request limit reached. Please try again later.',
    });
    if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = AgentQuerySchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid agent query' }, { status: 400 });
    }

    const promptAssessment = assessAiPrompt(parsed.data.query);
    if (promptAssessment.allowed === false) {
        return NextResponse.json(
            { error: 'Prompt violates the AI safety policy.', code: 'AI_PROMPT_REJECTED' },
            { status: 400 },
        );
    }

    const { agent } = await params;
    if (!isAllowedAgentId(agent)) {
        return NextResponse.json({ error: 'Unknown agent.' }, { status: 404 });
    }
    try {
        ensureAgentServiceConfigured(agent);
        const policy = loadAiBudgetPolicy();
        const metering = loadAgentProxyMetering();
        const estimate = estimateAiBudget(
            promptAssessment.prompt,
            policy.maxOutputTokens,
            [metering.pricing],
        );
        reservation = await reserveAiBudget({
            tenantId: auth.context.tenantId,
            userId: auth.context.userId,
            estimate,
            policy,
            provider: metering.provider,
            model: metering.model,
            agentType: `ASYNC_${agent.slice(0, 120).toUpperCase()}`,
        });

        const response = await forwardAgentRequest(
            auth.context,
            `/api/v1/agents/${encodeURIComponent(agent)}/query_async`,
            {
                agentId: agent,
                method: 'POST',
                body: {
                    query: promptAssessment.prompt,
                    tenant_id: auth.context.tenantId,
                    user_id: auth.context.userId,
                },
            },
        );
        await settleAiBudget({
            reservation,
            status: response.ok ? 'COMPLETED' : 'FAILED',
            failureReason: response.ok ? undefined : `upstream_http_${response.status}`,
        });
        return response;
    } catch (error) {
        if (reservation) {
            await settleAiBudget({
                reservation,
                status: 'FAILED',
                failureReason: error instanceof Error ? error.name : 'upstream_error',
            }).catch(() => undefined);
        }
        const budgetResponse = aiBudgetErrorResponse(error);
        if (budgetResponse) return budgetResponse;
        return agentUnavailableResponse(error);
    }
}
