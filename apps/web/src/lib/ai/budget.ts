/**
 * Per-tenant cost and rate control.
 *
 * A shared model provider is a shared bill, so usage is metered per tenant, not
 * per process. The ledger is `agent_audit_logs` (tenant-scoped, RLS-forced), which
 * already carries tokens_used and latency_ms — the budget is read back from the
 * same rows the audit trail is built from, so the numbers cannot drift apart.
 *
 * Burst control (a user hammering the box in one minute) stays with the existing
 * shared rate limiter; the daily budget below is the tenant-level spend ceiling.
 */
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { runTenantScopedRead } from './tenant-query';
import type { AiToolContext } from './types';

function positiveInt(name: string, fallback: number): number {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export function aiBudgetLimits() {
    return {
        dailyTokens: positiveInt('AI_TENANT_DAILY_TOKEN_BUDGET', 200_000),
        dailyRequests: positiveInt('AI_TENANT_DAILY_REQUEST_BUDGET', 200),
        usdPerMillionTokens: Number(process.env.AI_COST_PER_MILLION_TOKENS_USD) || 0.1,
    };
}

export function estimateUsdCost(tokens: number): number {
    const { usdPerMillionTokens } = aiBudgetLimits();
    return Math.round((tokens / 1_000_000) * usdPerMillionTokens * 1e6) / 1e6;
}

export interface AiBudgetState {
    allowed: boolean;
    reason?: string;
    tokensUsedToday: number;
    requestsToday: number;
    dailyTokenLimit: number;
    dailyRequestLimit: number;
    estimatedUsdToday: number;
}

/** Today's spend for this tenant, read from the tenant's own audit rows. */
export async function readTenantAiUsage(context: AiToolContext): Promise<Omit<AiBudgetState, 'allowed' | 'reason'>> {
    const rows = await runTenantScopedRead<{ tokens: string; requests: string }>(
        context,
        `SELECT COALESCE(SUM(tokens_used), 0)::text AS tokens, COUNT(*)::text AS requests
         FROM agent_audit_logs
         WHERE tenant_id = $1 AND created_at >= date_trunc('day', now())
         LIMIT 1`,
    );
    const tokensUsedToday = Number(rows[0]?.tokens ?? 0);
    const requestsToday = Number(rows[0]?.requests ?? 0);
    const limits = aiBudgetLimits();

    return {
        tokensUsedToday,
        requestsToday,
        dailyTokenLimit: limits.dailyTokens,
        dailyRequestLimit: limits.dailyRequests,
        estimatedUsdToday: estimateUsdCost(tokensUsedToday),
    };
}

/**
 * Gate one assistant turn. Returns a plain-language reason when the turn is
 * refused — the caller states that reason instead of answering.
 */
export async function checkAiBudget(context: AiToolContext): Promise<AiBudgetState> {
    const usage = await readTenantAiUsage(context);

    if (usage.requestsToday >= usage.dailyRequestLimit) {
        return {
            ...usage,
            allowed: false,
            reason: `This school has used its ${usage.dailyRequestLimit} assistant requests for today. The limit resets at midnight; the underlying screens keep working.`,
        };
    }
    if (usage.tokensUsedToday >= usage.dailyTokenLimit) {
        return {
            ...usage,
            allowed: false,
            reason: `This school has reached its daily assistant model budget (${usage.dailyTokenLimit.toLocaleString()} tokens). The limit resets at midnight; the underlying screens keep working.`,
        };
    }

    const burst = await consumeRateLimit(`${context.tenantId}:${context.userId}`, {
        scope: 'ai_assistant',
        maxAttempts: 20,
        degradedMaxAttempts: 3,
        endpointClass: 'ai',
        message: 'Too many assistant requests in a short window. Try again in a minute.',
    });
    if (burst) {
        return { ...usage, allowed: false, reason: burst };
    }

    return { ...usage, allowed: true };
}
