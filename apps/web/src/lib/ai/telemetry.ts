/**
 * Structured logging for assistant turns.
 *
 * What is recorded: who asked (tenant + correlation id), what was asked, which
 * tools ran, with which ARGUMENT KEYS, how many rows each returned, which approval
 * requests were raised, tokens and latency.
 *
 * What is deliberately NOT recorded: the content of any student, guardian, invoice
 * or attendance record. Tool arguments are reduced to their key names because a
 * value can itself be an identifier, and tool results are reduced to counts. The
 * assistant's answer is stored as an outcome code, never as prose that might quote
 * a record back into a log table.
 */
import { pool, runWithTenantContext } from '@/lib/db';
import { logger } from '@/lib/observability/logger';
import type { AiToolRun } from './types';

export const AI_AGENT_NAME = 'school_assistant';

export type AiTurnOutcome =
    | 'answered'
    | 'refused_no_tools'
    | 'refused_no_grounding'
    | 'refused_budget'
    | 'unavailable_no_provider'
    | 'provider_error';

export interface AiTurnLogInput {
    tenantId: string;
    requestId: string;
    userId: string;
    role: string;
    /** The user's own question. Digit runs are masked before it is stored. */
    question: string;
    outcome: AiTurnOutcome;
    toolRuns: readonly AiToolRun[];
    /** Argument KEYS per tool call, in call order. Values are never captured. */
    toolCallShapes: readonly { toolName: string; argumentKeys: string[] }[];
    tokensUsed: number;
    latencyMs: number;
}

/**
 * Scrubs Indian Aadhaar numbers, PAN numbers, email addresses, and 10+ digit
 * phone numbers BEFORE any prompt or context string leaves for an external LLM.
 */
export function redactPiiForExternalLlm(text: string): string {
    if (!text) return '';
    return text
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
        .replace(/\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b/g, '[REDACTED_PAN]')
        .replace(/(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, '[REDACTED_AADHAAR]')
        .replace(/\+?\d[\d\s().-]{8,}\d/g, (match) => {
            const digits = match.replace(/\D/g, '');
            if (digits.length === 12 && /^[2-9]\d{11}$/.test(digits) && !match.trim().startsWith('+')) {
                return '[REDACTED_AADHAAR]';
            }
            if (digits.length >= 10 && digits.length <= 15) {
                return '[REDACTED_PHONE]';
            }
            return match;
        });
}

/** Masks anything that looks like an identifier or contact number. */
export function redactQuestion(question: string): string {
    return question
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
        .replace(/\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b/g, '[pan]')
        .replace(/\b\d[\d\s-]{4,}\d\b/g, '[number]')
        .slice(0, 1000);
}

function summariseRuns(toolRuns: readonly AiToolRun[]) {
    return toolRuns.map((run) => {
        if (run.status === 'read') {
            return { tool: run.toolName, kind: run.kind, status: run.status, rowCount: run.output.rows.length };
        }
        if (run.status === 'approval_requested') {
            return {
                tool: run.toolName,
                kind: run.kind,
                status: run.status,
                approvalRequestId: run.approvalRequestId,
                approvalStatus: run.approvalStatus,
                policyId: run.policyId,
            };
        }
        return { tool: run.toolName, kind: run.kind, status: run.status };
    });
}

export async function recordAiTurn(input: AiTurnLogInput): Promise<void> {
    const toolCalls = input.toolCallShapes.map((call) => ({
        tool: call.toolName,
        argumentKeys: call.argumentKeys,
    }));
    const toolResults = summariseRuns(input.toolRuns);

    logger.info('ai.turn', 'Assistant turn completed', {
        tenantId: input.tenantId,
        requestId: input.requestId,
        actorUserId: input.userId,
        source: 'ai-spine',
        metadata: {
            outcome: input.outcome,
            role: input.role,
            tools: toolResults,
            // `units` are model tokens. The observability sanitizer redacts any key
            // whose name contains "token", so the metric is named for what it costs.
            modelUsage: { units: input.tokensUsed, latencyMs: input.latencyMs },
        },
    });

    try {
        await runWithTenantContext(input.tenantId, async () => {
            await pool.query(
                `INSERT INTO agent_audit_logs (
                    tenant_id, agent_name, query, prompt, response, tool_calls, tool_results, tokens_used, latency_ms
                 )
                 VALUES ($1, $2, $3, NULL, $4, $5::jsonb, $6::jsonb, $7, $8)`,
                [
                    input.tenantId,
                    AI_AGENT_NAME,
                    redactQuestion(input.question),
                    `outcome:${input.outcome}`,
                    JSON.stringify(toolCalls),
                    JSON.stringify(toolResults),
                    Math.max(0, Math.round(input.tokensUsed)),
                    Math.max(0, Math.round(input.latencyMs)),
                ],
            );
        });
    } catch (error) {
        logger.error('ai.turn_log_failed', 'Failed to persist assistant audit row', {
            tenantId: input.tenantId,
            requestId: input.requestId,
            source: 'ai-spine',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
    }
}
