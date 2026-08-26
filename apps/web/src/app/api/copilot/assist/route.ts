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
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
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
        requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
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

    const body: AssistantCapabilities = {
        providerConfigured: provider.configured,
        providerMessage: provider.configured ? null : provider.reason,
        tools: describeTools(auth.context.role),
        usage,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = AssistRequestSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Ask a question in a sentence.' }, { status: 400 });
    }

    const result = await runAssistantTurn(
        aiToolRegistry,
        parsed.data.question,
        contextFrom(auth.context, request),
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
