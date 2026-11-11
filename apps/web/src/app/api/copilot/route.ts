/**
 * Admin copilot — bounded, human-in-the-loop report drafting.
 *
 * What this endpoint does: turns one natural-language sentence into a *draft report
 * configuration* made only of ids that already exist in the caller's governed BI
 * catalog. A person then reviews it and runs it on /reports.
 *
 * What it deliberately does NOT do: it does not query tenant data, does not compute
 * or return any figure, and never surfaces the model's own prose. Everything the
 * caller sees is either a catalog label or a server-generated sentence built from the
 * validated draft, so the copilot cannot state something it did not derive.
 *
 * If no model provider is configured the endpoint says so (503) rather than degrading
 * into something that looks like an answer.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import type { AuthorizationRole } from '@school-sis/api';
import { checkAiBudget, recordAiTurn, type AiToolContext } from '@/lib/ai';
import { requireApiAuth } from '@/lib/auth/api';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { logger, requestContextFrom } from '@/lib/observability/logger';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
    COPILOT_ROLES,
    describeCatalogForModel,
    listCopilotDatasets,
    summariseDraft,
    validateProposal,
    type CopilotReportDraft,
} from './catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CopilotRequestSchema = z.object({
    prompt: z.string().trim().min(1).max(4000),
});

const ProposalSchema = z.object({
    datasetId: z.string().describe('One dataset id, copied exactly from the catalog below.'),
    metricIds: z
        .array(z.string())
        .min(1)
        .describe('One or more metric ids that belong to that dataset, copied exactly.'),
    dimensionIds: z
        .array(z.string())
        .optional()
        .describe('Dimension ids to group by, copied exactly. Omit when no breakdown is asked for.'),
    filters: z
        .array(z.object({ dimensionId: z.string(), value: z.string() }))
        .optional()
        .describe('Equality filters on filterable dimensions of that dataset.'),
});

export interface CopilotResponseBody {
    ok: boolean;
    summary: string;
    draft: CopilotReportDraft | null;
    error?: string;
}

export async function POST(req: Request) {
    const started = Date.now();
    const auth = await requireApiAuth(COPILOT_ROLES);
    if (auth.ok === false) return auth.response;

    const limitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
        scope: 'ai_copilot',
        maxAttempts: 10,
        degradedMaxAttempts: 1,
        endpointClass: 'ai',
        message: 'AI request limit reached. Please try again later.',
    });
    if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

    const json = await readTenantScopedJson(req, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = CopilotRequestSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Describe the report you want in a sentence.' }, { status: 400 });
    }

    const aiContext: AiToolContext = {
        tenantId: auth.context.tenantId,
        userId: auth.context.userId,
        role: auth.context.role as AuthorizationRole,
        requestId: requestContextFrom(req).requestId,
    };

    const datasets = listCopilotDatasets(auth.context);
    if (datasets.length === 0) {
        await recordAiTurn({
            tenantId: aiContext.tenantId,
            requestId: aiContext.requestId,
            userId: aiContext.userId,
            role: aiContext.role,
            question: parsed.data.prompt,
            outcome: 'refused_no_tools',
            toolRuns: [],
            toolCallShapes: [],
            tokensUsed: 0,
            latencyMs: Date.now() - started,
        });
        return NextResponse.json(
            {
                error:
                    'The BI catalog grants your role no runnable dataset, so there is nothing the copilot can draft a report over.',
            },
            { status: 409 },
        );
    }

    const budget = await checkAiBudget(aiContext);
    if (!budget.allowed) {
        await recordAiTurn({
            tenantId: aiContext.tenantId,
            requestId: aiContext.requestId,
            userId: aiContext.userId,
            role: aiContext.role,
            question: parsed.data.prompt,
            outcome: 'refused_budget',
            toolRuns: [],
            toolCallShapes: [],
            tokensUsed: 0,
            latencyMs: Date.now() - started,
        });
        return NextResponse.json(
            { error: budget.reason ?? 'The assistant budget for this school is exhausted for today.' },
            { status: 429 },
        );
    }

    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
        await recordAiTurn({
            tenantId: aiContext.tenantId,
            requestId: aiContext.requestId,
            userId: aiContext.userId,
            role: aiContext.role,
            question: parsed.data.prompt,
            outcome: 'unavailable_no_provider',
            toolRuns: [],
            toolCallShapes: [],
            tokensUsed: 0,
            latencyMs: Date.now() - started,
        });
        return NextResponse.json(
            {
                error:
                    'No model provider is configured for this deployment, so the copilot cannot draft a report. Set CEREBRAS_API_KEY to enable it.',
            },
            { status: 503 },
        );
    }

    const cerebras = createOpenAI({
        apiKey,
        baseURL: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    });

    const systemPrompt = [
        'You map a school administrator\'s request onto ONE report in a fixed catalog.',
        'You do not answer questions, you do not state numbers, and you do not have access to any school data.',
        'Call the proposeReport tool exactly once, using ids copied character-for-character from the catalog.',
        'Never invent a dataset, metric or dimension id. If nothing in the catalog fits, do not call the tool.',
        '',
        'Catalog available to this user:',
        '',
        describeCatalogForModel(datasets),
    ].join('\n');

    let accepted: CopilotReportDraft | null = null;
    let rejection: string | null = null;
    let tokensUsed = 0;
    const toolCallShapes: { toolName: string; argumentKeys: string[] }[] = [];

    try {
        const result = await generateText({
            model: cerebras(process.env.CEREBRAS_MODEL || 'llama3.1-8b'),
            system: systemPrompt,
            prompt: parsed.data.prompt,
            maxOutputTokens: 1024,
            stopWhen: stepCountIs(2),
            tools: {
                proposeReport: tool({
                    description:
                        'Propose one report configuration built from catalog ids. The server validates every id before anything is shown to the user.',
                    inputSchema: ProposalSchema,
                    execute: async (proposal) => {
                        toolCallShapes.push({
                            toolName: 'copilot.propose_report',
                            argumentKeys: Object.keys(proposal ?? {}).sort(),
                        });
                        const validation = validateProposal(datasets, proposal);
                        if (validation.ok === false) {
                            rejection = validation.reason;
                            return { accepted: false, reason: validation.reason };
                        }
                        accepted = validation.draft;
                        rejection = null;
                        return { accepted: true };
                    },
                }),
            },
        });
        tokensUsed =
            result.usage?.totalTokens ??
            (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    } catch (error) {
        logger.error('ai.copilot_failed', 'Copilot model request failed', {
            tenantId: aiContext.tenantId,
            requestId: aiContext.requestId,
            actorUserId: aiContext.userId,
            source: 'ai',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        await recordAiTurn({
            tenantId: aiContext.tenantId,
            requestId: aiContext.requestId,
            userId: aiContext.userId,
            role: aiContext.role,
            question: parsed.data.prompt,
            outcome: 'provider_error',
            toolRuns: [],
            toolCallShapes,
            tokensUsed: 0,
            latencyMs: Date.now() - started,
        });
        return NextResponse.json(
            { error: 'The model provider did not return a usable response. Nothing was drafted.' },
            { status: 502 },
        );
    }

    const draft: CopilotReportDraft | null = accepted;
    if (!draft) {
        await recordAiTurn({
            tenantId: aiContext.tenantId,
            requestId: aiContext.requestId,
            userId: aiContext.userId,
            role: aiContext.role,
            question: parsed.data.prompt,
            outcome: 'refused_no_grounding',
            toolRuns: [],
            toolCallShapes,
            tokensUsed,
            latencyMs: Date.now() - started,
        });
        return NextResponse.json(
            {
                error:
                    rejection ??
                    'The copilot could not match that request to a dataset your role can report on. Nothing was drafted — build the report directly on the Reporting Engine.',
            },
            { status: 422 },
        );
    }

    await recordAiTurn({
        tenantId: aiContext.tenantId,
        requestId: aiContext.requestId,
        userId: aiContext.userId,
        role: aiContext.role,
        question: parsed.data.prompt,
        outcome: 'answered',
        toolRuns: [],
        toolCallShapes,
        tokensUsed,
        latencyMs: Date.now() - started,
    });

    const body: CopilotResponseBody = {
        ok: true,
        summary: summariseDraft(draft),
        draft,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
