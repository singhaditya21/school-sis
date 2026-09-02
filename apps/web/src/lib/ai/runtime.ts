/**
 * The assistant runtime: one bounded turn.
 *
 * Sequence, in order, with the failure mode of each step spelled out:
 *   1. Resolve the tools this role may use. None -> say so, run nothing.
 *   2. Check the tenant's daily budget and burst limit. Over -> say so, run nothing.
 *   3. Resolve the model provider. None -> say so, run nothing. No fallback answer.
 *   4. Let the model choose tools. Every call goes through the executor.
 *   5. Refuse to show model prose that is not grounded in at least one tool result.
 *   6. Log the turn: what was asked, which tools ran, tokens, latency — no records.
 *
 * The grounding rule in step 5 is the difference between an assistant and a
 * plausible-sentence generator. If the model answered without consulting the
 * school's own data, the user is told that instead of being shown the sentence.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { checkAiBudget, estimateUsdCost, type AiBudgetState } from './budget';
import { executeAiTool } from './executor';
import { toModelToolName } from './model-names';
import { resolveAiProviderChain, type AiProviderConfig } from './provider';
import { describeToolsForModel, type AiToolRegistry } from './registry';
import { recordAiTurn, type AiTurnOutcome } from './telemetry';
import type { AiTool, AiToolContext, AiToolRun } from './types';
import { logger } from '@/lib/observability/logger';

export function createAiModel(config: AiProviderConfig) {
    const provider = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    return provider(config.model);
}

export interface AiTurnResult {
    ok: boolean;
    outcome: AiTurnOutcome;
    /** Always safe to display. Either the grounded answer or a plain refusal. */
    message: string;
    toolRuns: AiToolRun[];
    /**
     * Which provider produced the answer and how many providers failed before it.
     * Absent when no provider ran (no provider configured, no tools, over budget).
     */
    provider?: { source: AiProviderConfig['source']; fallbacks: number };
    usage: {
        tokensUsed: number;
        latencyMs: number;
        estimatedUsd: number;
        tokensUsedToday: number;
        dailyTokenLimit: number;
    };
}

function budgetUsage(budget: AiBudgetState, tokensUsed: number, latencyMs: number) {
    return {
        tokensUsed,
        latencyMs,
        estimatedUsd: estimateUsdCost(tokensUsed),
        tokensUsedToday: budget.tokensUsedToday + tokensUsed,
        dailyTokenLimit: budget.dailyTokenLimit,
    };
}

function systemPrompt(tools: readonly AiTool<never>[]): string {
    return [
        'You are the assistant inside a school information system. You serve exactly one school and you can only see that school.',
        '',
        'Rules you must follow:',
        '1. You have no knowledge of this school. Every fact you state must come from a tool result in this conversation.',
        '2. If no tool can answer the question, say so plainly. Never estimate, never illustrate with an example figure.',
        '3. Tools marked "mutation" change nothing. They raise a request for a human to approve. Say so; never claim an action was done.',
        '4. Never state or repeat a student name, guardian name, phone number, address or identity number.',
        '5. Money is in rupees. Repeat amounts exactly as a tool returned them.',
        '',
        'Tools available to this user:',
        describeToolsForModel(tools),
    ].join('\n');
}

export async function runAssistantTurn(
    registry: AiToolRegistry,
    question: string,
    context: AiToolContext,
): Promise<AiTurnResult> {
    const started = Date.now();
    const availableTools = registry.forRole(context.role);

    const emptyUsage = {
        tokensUsed: 0,
        latencyMs: 0,
        estimatedUsd: 0,
        tokensUsedToday: 0,
        dailyTokenLimit: 0,
    };

    if (availableTools.length === 0) {
        const message = `Your role (${context.role}) holds none of the permissions the assistant's tools require, so there is nothing it can look up for you.`;
        await recordAiTurn({
            tenantId: context.tenantId,
            requestId: context.requestId,
            userId: context.userId,
            role: context.role,
            question,
            outcome: 'refused_no_tools',
            toolRuns: [],
            toolCallShapes: [],
            tokensUsed: 0,
            latencyMs: Date.now() - started,
        });
        return { ok: false, outcome: 'refused_no_tools', message, toolRuns: [], usage: emptyUsage };
    }

    const budget = await checkAiBudget(context);
    if (!budget.allowed) {
        await recordAiTurn({
            tenantId: context.tenantId,
            requestId: context.requestId,
            userId: context.userId,
            role: context.role,
            question,
            outcome: 'refused_budget',
            toolRuns: [],
            toolCallShapes: [],
            tokensUsed: 0,
            latencyMs: Date.now() - started,
        });
        return {
            ok: false,
            outcome: 'refused_budget',
            message: budget.reason ?? 'The assistant budget for this school is exhausted for today.',
            toolRuns: [],
            usage: budgetUsage(budget, 0, Date.now() - started),
        };
    }

    const providerChain = resolveAiProviderChain();
    if (!providerChain.configured) {
        await recordAiTurn({
            tenantId: context.tenantId,
            requestId: context.requestId,
            userId: context.userId,
            role: context.role,
            question,
            outcome: 'unavailable_no_provider',
            toolRuns: [],
            toolCallShapes: [],
            tokensUsed: 0,
            latencyMs: Date.now() - started,
        });
        return {
            ok: false,
            outcome: 'unavailable_no_provider',
            message: providerChain.reason,
            toolRuns: [],
            usage: budgetUsage(budget, 0, Date.now() - started),
        };
    }

    const toolRuns: AiToolRun[] = [];
    const toolCallShapes: { toolName: string; argumentKeys: string[] }[] = [];

    const modelTools = Object.fromEntries(
        availableTools.map((definition) => [
            toModelToolName(definition.name),
            tool({
                description: definition.description,
                inputSchema: definition.inputSchema as z.ZodType<Record<string, unknown>>,
                execute: async (input: Record<string, unknown>) => {
                    toolCallShapes.push({
                        toolName: definition.name,
                        argumentKeys: Object.keys(input ?? {}).sort(),
                    });
                    const execution = await executeAiTool(registry, definition.name, input, context);
                    toolRuns.push(execution.run);
                    return execution.modelResult;
                },
            }),
        ]),
    );

    let text = '';
    let tokensUsed = 0;
    let answeredBy: AiProviderConfig['source'] | null = null;
    let fallbacks = 0;

    // Try each configured provider in order. A provider that fails BEFORE running
    // any tool falls back to the next (transient outage/rate-limit). A provider
    // that fails AFTER a tool has run does NOT fall back — its tool may have been a
    // read or an approval request, and re-running on the next provider would
    // duplicate that side effect. There, the turn ends as a provider error.
    for (const config of providerChain.chain) {
        const runsBeforeAttempt = toolRuns.length;
        try {
            const result = await generateText({
                model: createAiModel(config),
                system: systemPrompt(availableTools),
                prompt: question,
                tools: modelTools,
                stopWhen: stepCountIs(4),
            });
            text = result.text.trim();
            tokensUsed =
                result.usage?.totalTokens ??
                (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
            answeredBy = config.source;
            break;
        } catch {
            if (toolRuns.length > runsBeforeAttempt) {
                // Side effects already happened on this provider; do not retry.
                break;
            }
            fallbacks += 1;
            logger.warn('ai.provider_fallback', 'AI model provider failed; trying the next provider', {
                tenantId: context.tenantId,
                requestId: context.requestId,
                source: 'ai',
                metadata: { failedProvider: config.source, attempt: fallbacks },
            });
        }
    }

    if (answeredBy === null) {
        const latencyMs = Date.now() - started;
        await recordAiTurn({
            tenantId: context.tenantId,
            requestId: context.requestId,
            userId: context.userId,
            role: context.role,
            question,
            outcome: 'provider_error',
            toolRuns,
            toolCallShapes,
            tokensUsed: 0,
            latencyMs,
        });
        return {
            ok: false,
            outcome: 'provider_error',
            message:
                'The model provider did not return a usable response. Nothing was looked up and nothing was changed.',
            toolRuns,
            usage: budgetUsage(budget, 0, latencyMs),
        };
    }

    const provider = { source: answeredBy, fallbacks };
    const latencyMs = Date.now() - started;
    const grounded = toolRuns.some((run) => run.status === 'read' || run.status === 'approval_requested');

    if (!grounded || text.length === 0) {
        const refusalReasons = toolRuns
            .filter((run): run is Extract<AiToolRun, { status: 'refused' }> => run.status === 'refused')
            .map((run) => run.reason);
        const message = refusalReasons.length
            ? refusalReasons.join(' ')
            : 'The assistant could not answer that from this school\'s data, so it has not answered. Nothing was looked up and nothing was changed.';

        await recordAiTurn({
            tenantId: context.tenantId,
            requestId: context.requestId,
            userId: context.userId,
            role: context.role,
            question,
            outcome: 'refused_no_grounding',
            toolRuns,
            toolCallShapes,
            tokensUsed,
            latencyMs,
        });
        return {
            ok: false,
            outcome: 'refused_no_grounding',
            message,
            toolRuns,
            provider,
            usage: budgetUsage(budget, tokensUsed, latencyMs),
        };
    }

    await recordAiTurn({
        tenantId: context.tenantId,
        requestId: context.requestId,
        userId: context.userId,
        role: context.role,
        question,
        outcome: 'answered',
        toolRuns,
        toolCallShapes,
        tokensUsed,
        latencyMs,
    });

    return {
        ok: true,
        outcome: 'answered',
        message: text,
        toolRuns,
        provider,
        usage: budgetUsage(budget, tokensUsed, latencyMs),
    };
}
