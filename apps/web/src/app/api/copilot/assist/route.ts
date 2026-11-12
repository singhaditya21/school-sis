/**
 * POST /api/copilot/assist — one bounded assistant turn.
 *
 * GET returns the capability envelope (tools this role may use, provider state,
 * today's budget) so the console can tell the truth before anyone types anything.
 *
 * The route itself holds no AI logic. Everything lives in the spine at
 * apps/web/src/lib/ai, so the next surface that wants assistance — a page, a job,
 * a webhook — reuses the same registry, the same tenant guard, the same approval
 * path and the same ledger instead of growing a second copilot.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { getSession } from '@/lib/auth/session';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { requestContextFrom } from '@/lib/observability/logger';
import { isDemoSession, isDemoTenantId } from '@/lib/tenant/demo-guard';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import type { AuthorizationRole } from '@school-sis/api';
import {
    aiToolRegistry,
    readTenantAiUsage,
    resolveAiProvider,
    runAssistantTurn,
    type AiToolContext,
    type AiTurnResult,
} from '@/lib/ai';
import { redactPiiForExternalLlm } from '@/lib/ai/telemetry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AssistRequestSchema = z.object({
    question: z.string().trim().min(1).max(2000),
});

export interface AssistantToolDescriptor {
    name: string;
    title: string;
    description: string;
    kind: 'read' | 'mutation';
    permission: string;
    approvalPolicyId?: string;
}

export interface AssistantCapabilities {
    providerConfigured: boolean;
    providerMessage: string | null;
    tools: AssistantToolDescriptor[];
    usage: {
        tokensUsedToday: number;
        requestsToday: number;
        dailyTokenLimit: number;
        dailyRequestLimit: number;
        estimatedUsdToday: number;
    } | null;
}

export type AssistantTurnResponse = AiTurnResult;

function contextFrom(auth: { tenantId: string; userId: string; role: string }, request: Request): AiToolContext {
    return {
        tenantId: auth.tenantId,
        userId: auth.userId,
        role: auth.role as AuthorizationRole,
        requestId: requestContextFrom(request).requestId,
    };
}

function describeTools(role: string): AssistantToolDescriptor[] {
    return aiToolRegistry.forRole(role).map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        kind: tool.kind,
        permission: tool.permission,
        approvalPolicyId: tool.kind === 'mutation' ? tool.approvalPolicyId : undefined,
    }));
}

export async function GET(request: Request) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const provider = resolveAiProvider();
    const context = contextFrom(auth.context, request);

    let usage: AssistantCapabilities['usage'] = null;
    try {
        const read = await readTenantAiUsage(context);
        usage = {
            tokensUsedToday: read.tokensUsedToday,
            requestsToday: read.requestsToday,
            dailyTokenLimit: read.dailyTokenLimit,
            dailyRequestLimit: read.dailyRequestLimit,
            estimatedUsdToday: read.estimatedUsdToday,
        };
    } catch {
        usage = null;
    }

    let sessionForDemo: Awaited<ReturnType<typeof getSession>> | null = null;
    try {
        sessionForDemo = await getSession();
    } catch {
        sessionForDemo = null;
    }
    const demoMode =
        isDemoSession(sessionForDemo) || (await isDemoTenantId(auth.context.tenantId));

    const body: AssistantCapabilities = {
        providerConfigured: demoMode ? true : provider.configured,
        providerMessage: demoMode || provider.configured ? null : provider.reason,
        tools: describeTools(auth.context.role),
        usage,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const limitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
        scope: 'ai_copilot_assist',
        maxAttempts: 20,
        degradedMaxAttempts: 1,
        endpointClass: 'ai',
        message: 'Too many assistant requests in a short window. Try again in a minute.',
    });
    if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

    const json = await readTenantScopedJson(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = AssistRequestSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Ask a question in a sentence.' }, { status: 400 });
    }

    let sessionForDemo: Awaited<ReturnType<typeof getSession>> | null = null;
    try {
        sessionForDemo = await getSession();
    } catch {
        sessionForDemo = null;
    }
    const forceDemoSandbox = isDemoSession(sessionForDemo);

    const result = await runAssistantTurn(
        aiToolRegistry,
        redactPiiForExternalLlm(parsed.data.question),
        contextFrom(auth.context, request),
        { forceDemoSandbox },
    );

    const status = result.ok
        ? 200
        : result.outcome === 'unavailable_no_provider'
          ? 503
          : result.outcome === 'refused_budget'
            ? 429
            : result.outcome === 'refused_no_tools'
              ? 403
              : result.outcome === 'provider_error'
                ? 502
                : 422;

    return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}
