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
import { requireApiAuth } from '@/lib/auth/api';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
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

    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            {
                error:
                    'No model provider is configured for this deployment, so the copilot cannot draft a report. Set CEREBRAS_API_KEY to enable it.',
            },
            { status: 503 },
        );
    }

    const json = await readTenantScopedJson(req, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = CopilotRequestSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Describe the report you want in a sentence.' }, { status: 400 });
    }

    const datasets = listCopilotDatasets(auth.context);
    if (datasets.length === 0) {
        return NextResponse.json(
            {
                error:
                    'The BI catalog grants your role no runnable dataset, so there is nothing the copilot can draft a report over.',
            },
            { status: 409 },
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

    try {
        await generateText({
            model: cerebras(process.env.CEREBRAS_MODEL || 'llama3.1-8b'),
            system: systemPrompt,
            prompt: parsed.data.prompt,
            stopWhen: stepCountIs(2),
            tools: {
                proposeReport: tool({
                    description:
                        'Propose one report configuration built from catalog ids. The server validates every id before anything is shown to the user.',
                    inputSchema: ProposalSchema,
                    execute: async (proposal) => {
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
    } catch (error) {
        console.error('[Copilot] Model request failed:', error);
        return NextResponse.json(
            { error: 'The model provider did not return a usable response. Nothing was drafted.' },
            { status: 502 },
        );
    }

    const draft: CopilotReportDraft | null = accepted;
    if (!draft) {
        return NextResponse.json(
            {
                error:
                    rejection ??
                    'The copilot could not match that request to a dataset your role can report on. Nothing was drafted — build the report directly on the Reporting Engine.',
            },
            { status: 422 },
        );
    }

    const body: CopilotResponseBody = {
        ok: true,
        summary: summariseDraft(draft),
        draft,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
